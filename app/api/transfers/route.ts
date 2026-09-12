/**
 * GET   /api/transfers?status=packing|dispatched|receiving|received
 * POST  /api/transfers  { to_outlet_id, note?, skus?: [] }        open a transfer (optionally with garments)
 * PATCH /api/transfers  { id, action: "add"|"remove", sku }       scan onto / off the list while packing
 *                       { id, action: "dispatch", boxes?, carrier? }   the box leaves: in transit
 *                       { id, action: "start_receiving" }          the box arrived at the outlet; scan-check begins
 *                       { id, action: "receive_scan", sku }        one garment checked in (also a late arrival on a closed transfer)
 *                       { id, action: "close_receiving", confirm } close: unscanned lines are missing, counts are stored
 *
 * Packing → In transit → Receiving → Received. Receiving is a scan of every
 * garment as it comes out of the box, so the close reconciles what was sent
 * against what arrived: missing garments are flagged (status 'missing') and
 * a garment that was in the box but not on the list is recorded as
 * unexpected. Receipt puts the garment in the outlet's stockroom; putting it
 * on the floor is a separate scan on the Floor screen, which is what stamps
 * the floor date and the colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { currentStaff, dbFor, requireStaff } from "@/lib/auth/staff";
import { meetsOutletMinimum, type GradeCode } from "@/lib/pricing/constants";
import { loadPricingContext } from "@/lib/pricing/repo";
import { reconcile } from "@/lib/transfers/reconcile";

export const instant = false;

const GRADE_NAMES: Record<GradeCode, string> = { bnwt: "Brand New with Tags", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };

const SELECT = "id, code, to_outlet_id, status, created_at, sent_at, received_at, receiving_started_at, boxes, carrier, note, received_count, missing_count, unexpected_count, outlets!transfers_to_outlet_id_fkey(name), creator:created_by(name), dispatcher:dispatched_by(name), receiver:received_by(name), transfer_items(item_id, qc, added_at, received_at, missing, unexpected, found_at, items(id, sku, brand_text, grade_code, size_label, price, price_manual, status, floored_on, sub_categories(name)))";

type Db = SupabaseClient;
const pkDate = (d = new Date()) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);

export async function GET(request: Request) {
  const supabase = await dbFor(await currentStaff());
  const status = new URL(request.url).searchParams.get("status");
  let q = supabase.from("transfers").select(SELECT).order("created_at", { ascending: false }).limit(100);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transfers: (data ?? []).map(shape) });
}

export async function POST(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  let body: { to_outlet_id?: number; note?: string | null; skus?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Number.isInteger(body.to_outlet_id)) return NextResponse.json({ error: "Pick the outlet." }, { status: 400 });

  const db = gate.db;
  const day = pkDate();
  const { data: bumped, error: seqErr } = await db.rpc("next_transfer_seq", { p_day: day });
  if (seqErr || typeof bumped !== "number") return NextResponse.json({ error: `Could not number the transfer: ${seqErr?.message ?? "no sequence"}` }, { status: 500 });
  const code = `TRF-${day.replace(/-/g, "")}-${String(bumped).padStart(4, "0")}`;

  const { data: transfer, error } = await db
    .from("transfers")
    .insert({ code, to_outlet_id: body.to_outlet_id, note: body.note?.trim() || null, created_by: gate.staff.id, status: "packing" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const added: string[] = [], rejected: string[] = [];
  for (const raw of body.skus ?? []) {
    const r = await addSku(db, transfer.id, body.to_outlet_id!, raw, gate.staff.id);
    (r.ok ? added : rejected).push(r.ok ? r.sku : `${raw}: ${r.error}`);
  }
  return NextResponse.json({ transfer: await reload(db, transfer.id), added, rejected });
}

export async function PATCH(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  let body: { id?: number; action?: string; sku?: string; boxes?: number | null; carrier?: string | null; confirm?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const db = gate.db;
  const me = gate.staff.id;
  const now = new Date().toISOString();
  const { data: t } = await db.from("transfers").select("id, code, to_outlet_id, status").eq("id", body.id).maybeSingle();
  if (!t) return NextResponse.json({ error: "No such transfer." }, { status: 404 });
  let extra: Record<string, unknown> = {};

  switch (body.action) {
    case "add":
    case "remove": {
      if (t.status !== "packing") return NextResponse.json({ error: "This transfer has already been dispatched." }, { status: 400 });
      if (!body.sku) return NextResponse.json({ error: "sku is required." }, { status: 400 });
      if (body.action === "add") {
        const r = await addSku(db, t.id, t.to_outlet_id, body.sku, me);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      } else {
        const { data: item } = await db.from("items").select("id").eq("sku", body.sku.trim().toUpperCase()).maybeSingle();
        if (item) {
          await db.from("transfer_items").delete().eq("transfer_id", t.id).eq("item_id", item.id);
          await db.from("items").update({ outlet_id: null }).eq("id", item.id).is("received_at", null);
        }
      }
      break;
    }
    case "dispatch": {
      if (t.status !== "packing") return NextResponse.json({ error: "Already dispatched." }, { status: 400 });
      const { count } = await db.from("transfer_items").select("item_id", { count: "exact", head: true }).eq("transfer_id", t.id);
      if (!count) return NextResponse.json({ error: "Scan at least one garment before dispatching." }, { status: 400 });
      const boxes = body.boxes == null || body.boxes === 0 ? null : Number(body.boxes);
      if (boxes != null && (!Number.isInteger(boxes) || boxes < 1 || boxes > 999)) return NextResponse.json({ error: "Boxes must be a whole number." }, { status: 400 });
      await db.from("transfers").update({ status: "dispatched", sent_at: now, dispatched_by: me, boxes, carrier: body.carrier?.trim() || null }).eq("id", t.id);
      break;
    }
    case "start_receiving": {
      if (t.status !== "dispatched") return NextResponse.json({ error: t.status === "packing" ? "This transfer has not been dispatched yet." : "Receiving has already started." }, { status: 400 });
      await db.from("transfers").update({ status: "receiving", receiving_started_at: now, receiving_started_by: me }).eq("id", t.id);
      break;
    }
    case "receive_scan": {
      if (t.status !== "receiving" && t.status !== "received") return NextResponse.json({ error: t.status === "packing" ? "This transfer has not been dispatched yet." : "Press Start receiving first." }, { status: 400 });
      const r = await receiveScan(db, t, body.sku ?? "", me, now);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
      extra = { scan: r };
      break;
    }
    case "close_receiving": {
      if (t.status !== "receiving") return NextResponse.json({ error: t.status === "received" ? "Already closed." : "Press Start receiving first." }, { status: 400 });
      const { data: lines } = await db.from("transfer_items").select("item_id, received_at, unexpected, items(sku)").eq("transfer_id", t.id);
      const rows = (lines ?? []).map((l) => ({ item_id: l.item_id, sku: one<{ sku: string }>(l.items)?.sku ?? "", received_at: l.received_at, unexpected: l.unexpected }));
      const rec = reconcile(rows);
      if (rec.missing.length && !body.confirm) return NextResponse.json({ error: "confirm", reconciliation: rec }, { status: 409 });
      const missingIds = rows.filter((r) => !r.unexpected && !r.received_at).map((r) => r.item_id);
      if (missingIds.length) {
        await db.from("transfer_items").update({ missing: true }).eq("transfer_id", t.id).in("item_id", missingIds);
        await db.from("items").update({ status: "missing" }).in("id", missingIds).in("status", ["tagged"]);
      }
      await db.from("transfers").update({ status: "received", received_at: now, received_by: me, received_count: rec.received.length + rec.unexpected.length, missing_count: rec.missing.length, unexpected_count: rec.unexpected.length }).eq("id", t.id);
      await db.from("admin_audits").insert({ changed_by: me, table_name: "transfers", row_key: String(t.id), before: { status: "receiving" }, after: { status: "received", ...rec }, note: `${t.code} closed: ${rec.received.length} received, ${rec.missing.length} missing, ${rec.unexpected.length} unexpected` }).then(() => {}, () => {});
      extra = { reconciliation: rec };
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json({ transfer: await reload(db, t.id), ...extra });
}

/** One garment scanned out of the box at the outlet. */
async function receiveScan(db: Db, t: { id: number; code: string; to_outlet_id: number; status: string }, raw: string, me: number, now: string): Promise<{ ok: true; sku: string; kind: "received" | "found" | "unexpected" | "already" } | { ok: false; error: string }> {
  const sku = raw.trim().toUpperCase();
  if (!sku) return { ok: false, error: "sku is required." };
  const { data: item } = await db.from("items").select("id, sku, status, outlet_id, channel").eq("sku", sku).maybeSingle();
  if (!item) return { ok: false, error: `${sku}: no such SKU` };
  const { data: line } = await db.from("transfer_items").select("received_at, missing, unexpected").eq("transfer_id", t.id).eq("item_id", item.id).maybeSingle();
  const arrive = () => db.from("items").update({ outlet_id: t.to_outlet_id, received_at: now, ...(item.status === "missing" ? { status: "tagged" } : {}) }).eq("id", item.id);

  if (line) {
    if (line.received_at) return { ok: true, sku, kind: "already" };
    if (t.status === "received" && !line.missing) return { ok: false, error: `${sku} is not open on ${t.code}.` };
    await db.from("transfer_items").update({ received_at: now, received_by: me, missing: false, found_at: line.missing ? now : null }).eq("transfer_id", t.id).eq("item_id", item.id);
    await arrive();
    if (line.missing) {
      const { data: cur } = await db.from("transfers").select("missing_count, received_count").eq("id", t.id).single();
      await db.from("transfers").update({ missing_count: Math.max(0, (cur?.missing_count ?? 1) - 1), received_count: (cur?.received_count ?? 0) + 1 }).eq("id", t.id);
      return { ok: true, sku, kind: "found" };
    }
    return { ok: true, sku, kind: "received" };
  }

  // Not on this list: in the box, so it is here. Record it as unexpected so the
  // reconciliation shows it, and whichever transfer it was on will show it missing.
  if (t.status === "received") return { ok: false, error: `${sku} is not on ${t.code}. Only garments flagged missing can be scanned in after closing.` };
  if (item.channel === "online") return { ok: false, error: `${sku} is online stock — it should not be in this box. Set it aside and tell the warehouse.` };
  if (["sold", "rejected", "pulled"].includes(item.status)) return { ok: false, error: `${sku} is ${item.status}.` };
  const { error } = await db.from("transfer_items").insert({ transfer_id: t.id, item_id: item.id, added_at: now, added_by: me, received_at: now, received_by: me, unexpected: true });
  if (error) return { ok: false, error: error.message };
  await arrive();
  return { ok: true, sku, kind: "unexpected" };
}

async function addSku(db: Db, transferId: number, toOutletId: number, raw: string, me: number): Promise<{ ok: true; sku: string } | { ok: false; error: string }> {
  const sku = raw.trim().toUpperCase();
  const { data: item } = await db.from("items").select("id, sku, status, outlet_id, received_at, qc_hold, grade_code, channel, outlet_override").eq("sku", sku).maybeSingle();
  if (!item) return { ok: false, error: "no such SKU" };
  if (item.qc_hold) return { ok: false, error: "held for QC — a senior must review and release it first" };
  const { settings } = await loadPricingContext(db);
  if (!item.outlet_override && !meetsOutletMinimum(item.grade_code as GradeCode, settings.outletMinGrade)) return { ok: false, error: `is ${GRADE_NAMES[item.grade_code as GradeCode] ?? item.grade_code} — outlets take ${GRADE_NAMES[settings.outletMinGrade]} and above` };
  if (item.channel === "online") return { ok: false, error: "is online stock — switch its channel on the garment page first" };
  if (item.status === "sold" || item.status === "rejected" || item.status === "pulled") return { ok: false, error: `is ${item.status}` };
  if (item.status === "missing") return { ok: false, error: "is flagged missing — scan it in on the transfer it went missing from" };
  const { data: elsewhere } = await db.from("transfer_items").select("transfer_id, transfers(status, code)").eq("item_id", item.id);
  const open = (elsewhere ?? []).find((e) => one<{ status: string }>(e.transfers)?.status !== "received");
  if (open) return { ok: false, error: `already on ${one<{ code: string }>(open.transfers)?.code}` };
  const { error } = await db.from("transfer_items").insert({ transfer_id: transferId, item_id: item.id, added_by: me });
  if (error) return { ok: false, error: error.message };
  // The destination is decided by the transfer; the garment leaves wherever it was.
  await db.from("items").update({ outlet_id: toOutletId, received_at: null, status: item.status === "on_floor" ? "tagged" : item.status, floored_on: null, colour_tag: null }).eq("id", item.id);
  return { ok: true, sku };
}

async function reload(db: Db, id: number) {
  const { data } = await db.from("transfers").select(SELECT).eq("id", id).single();
  return data ? shape(data) : null;
}

const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;

function shape(t: Record<string, unknown>) {
  type Item = { id: number; sku: string; brand_text: string | null; grade_code: string; size_label: string | null; price: number | null; price_manual: number | null; status: string; floored_on: string | null; sub_categories: unknown };
  const lines = (t.transfer_items as { items: unknown; qc?: boolean; added_at: string; received_at: string | null; missing: boolean; unexpected: boolean; found_at: string | null }[] | null) ?? [];
  const items = lines
    .map((l) => ({ i: one<Item>(l.items), l }))
    .filter((x) => x.i)
    .map(({ i, l }) => ({ id: i!.id, sku: i!.sku, brand: i!.brand_text ?? "", sub_category: one<{ name: string }>(i!.sub_categories)?.name ?? "", grade: i!.grade_code, size_label: i!.size_label, list_price: i!.price_manual ?? i!.price, status: i!.status, floored_on: i!.floored_on, qc: Boolean(l.qc), added_at: l.added_at, received_at: l.received_at, missing: l.missing, unexpected: l.unexpected, found_at: l.found_at }))
    .sort((a, b) => a.added_at.localeCompare(b.added_at));
  return {
    id: t.id,
    code: t.code,
    to_outlet_id: t.to_outlet_id,
    to_outlet: one<{ name: string }>(t.outlets)?.name ?? "",
    status: t.status,
    created_at: t.created_at,
    created_by: one<{ name: string }>(t.creator)?.name ?? "",
    sent_at: t.sent_at,
    dispatched_by: one<{ name: string }>(t.dispatcher)?.name ?? "",
    boxes: t.boxes,
    carrier: t.carrier,
    receiving_started_at: t.receiving_started_at,
    received_at: t.received_at,
    received_by: one<{ name: string }>(t.receiver)?.name ?? "",
    received_count: t.received_count,
    missing_count: t.missing_count,
    unexpected_count: t.unexpected_count,
    note: t.note,
    items,
  };
}
