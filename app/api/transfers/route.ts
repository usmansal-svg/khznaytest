/**
 * GET   /api/transfers?status=open|sent|received
 * POST  /api/transfers  { to_outlet_id, note?, skus?: [] }        create (optionally with garments)
 * PATCH /api/transfers  { id, action: "add"|"remove", sku }       edit the list while open
 *                       { id, action: "send" }                     mark shipped
 *                       { id, action: "receive" }                  mark arrived: garments now live at the outlet
 *
 * A transfer is a shipment of tagged garments to an outlet. Receiving it sets
 * each garment's outlet and received_at — that is how "where is it?" is
 * answered without a spreadsheet.
 */

import { NextResponse } from "next/server";

import { currentStaff, dbFor, requireStaff } from "@/lib/auth/staff";
import { meetsOutletMinimum, type GradeCode } from "@/lib/pricing/constants";
import { colourForMonth } from "@/lib/pricing/engine";
import { loadPricingContext } from "@/lib/pricing/repo";

const GRADE_NAMES: Record<GradeCode, string> = { bnwt: "Brand New with Tags", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };

const SELECT = "id, code, to_outlet_id, status, created_at, sent_at, received_at, note, outlets!transfers_to_outlet_id_fkey(name), transfer_items(item_id, qc, items(id, sku, brand_text, grade_code, size_label, price, price_manual, status, sub_categories(name)))";

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
  const today = new Date();
  const day = today.toISOString().slice(0, 10);
  const { data: bumped, error: seqErr } = await db.rpc("next_transfer_seq", { p_day: day });
  if (seqErr || typeof bumped !== "number") return NextResponse.json({ error: `Could not number the transfer: ${seqErr?.message ?? "no sequence"}` }, { status: 500 });
  const seq = bumped;
  const code = `TRF-${day.replace(/-/g, "")}-${String(seq).padStart(4, "0")}`;

  const { data: transfer, error } = await db
    .from("transfers")
    .insert({ code, to_outlet_id: body.to_outlet_id, note: body.note?.trim() || null, created_by: gate.staff.id })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const added: string[] = [], rejected: string[] = [];
  for (const raw of body.skus ?? []) {
    const r = await addSku(db, transfer.id, body.to_outlet_id!, raw);
    (r.ok ? added : rejected).push(r.ok ? r.sku : `${raw}: ${r.error}`);
  }
  const { data: full } = await db.from("transfers").select(SELECT).eq("id", transfer.id).single();
  return NextResponse.json({ transfer: full ? shape(full) : null, added, rejected });
}

export async function PATCH(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  let body: { id?: number; action?: string; sku?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const db = gate.db;
  const { data: t } = await db.from("transfers").select("id, to_outlet_id, status").eq("id", body.id).maybeSingle();
  if (!t) return NextResponse.json({ error: "No such transfer." }, { status: 404 });

  if (body.action === "add" || body.action === "remove") {
    if (t.status !== "open") return NextResponse.json({ error: "This transfer has already been sent." }, { status: 400 });
    if (!body.sku) return NextResponse.json({ error: "sku is required." }, { status: 400 });
    if (body.action === "add") {
      const r = await addSku(db, t.id, t.to_outlet_id, body.sku);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    } else {
      const { data: item } = await db.from("items").select("id").eq("sku", body.sku.trim().toUpperCase()).maybeSingle();
      if (item) await db.from("transfer_items").delete().eq("transfer_id", t.id).eq("item_id", item.id);
    }
  } else if (body.action === "send") {
    if (t.status !== "open") return NextResponse.json({ error: "Already sent." }, { status: 400 });
    await db.from("transfers").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", t.id);
  } else if (body.action === "receive") {
    if (t.status === "received") return NextResponse.json({ error: "Already received." }, { status: 400 });
    const { data: lines } = await db.from("transfer_items").select("item_id").eq("transfer_id", t.id);
    const ids = (lines ?? []).map((l) => l.item_id);
    // Receiving is flooring: the garment is on sale from today, in this
    // month's colour, and the markdown clock starts. The POS reads these.
    const now = new Date();
    const flooredOn = new Date(now.getTime() + 5 * 3600_000).toISOString().slice(0, 10); // Pakistan date
    if (ids.length) await db.from("items").update({ outlet_id: t.to_outlet_id, received_at: now.toISOString(), status: "on_floor", floored_on: flooredOn, colour_tag: colourForMonth(now) }).in("id", ids).in("status", ["tagged", "on_floor"]);
    await db.from("transfers").update({ status: "received", received_at: new Date().toISOString(), received_by: gate.staff.id }).eq("id", t.id);
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { data: full } = await db.from("transfers").select(SELECT).eq("id", t.id).single();
  return NextResponse.json({ transfer: full ? shape(full) : null });
}

async function addSku(db: Awaited<ReturnType<typeof dbFor>>, transferId: number, toOutletId: number, raw: string): Promise<{ ok: true; sku: string } | { ok: false; error: string }> {
  const sku = raw.trim().toUpperCase();
  const { data: item } = await db.from("items").select("id, sku, status, outlet_id, qc_hold, grade_code, channel, outlet_override").eq("sku", sku).maybeSingle();
  if (!item) return { ok: false, error: "no such SKU" };
  if (item.qc_hold) return { ok: false, error: "held for QC — a senior must regrade and release it first" };
  const { settings } = await loadPricingContext(db);
  if (!item.outlet_override && !meetsOutletMinimum(item.grade_code as GradeCode, settings.outletMinGrade)) return { ok: false, error: `is ${GRADE_NAMES[item.grade_code as GradeCode] ?? item.grade_code} — outlets take ${GRADE_NAMES[settings.outletMinGrade]} and above` };
  if (item.channel === "online") return { ok: false, error: "is online stock — switch its channel on the garment page first" };
  if (item.status === "sold" || item.status === "rejected" || item.status === "pulled") return { ok: false, error: `is ${item.status}` };
  const { data: elsewhere } = await db.from("transfer_items").select("transfer_id, transfers(status, code)").eq("item_id", item.id);
  const open = (elsewhere ?? []).find((e) => (Array.isArray(e.transfers) ? e.transfers[0] : e.transfers)?.status !== "received");
  if (open) return { ok: false, error: `already on ${(Array.isArray(open.transfers) ? open.transfers[0] : open.transfers)?.code}` };
  const { error } = await db.from("transfer_items").insert({ transfer_id: transferId, item_id: item.id });
  if (error) return { ok: false, error: error.message };
  // The destination is decided by the transfer.
  await db.from("items").update({ outlet_id: toOutletId }).eq("id", item.id);
  return { ok: true, sku };
}

function shape(t: Record<string, unknown>) {
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const lines = (t.transfer_items as { items: unknown; qc?: boolean }[] | null) ?? [];
  return {
    id: t.id,
    code: t.code,
    to_outlet_id: t.to_outlet_id,
    to_outlet: one<{ name: string }>(t.outlets)?.name ?? "",
    status: t.status,
    created_at: t.created_at,
    sent_at: t.sent_at,
    received_at: t.received_at,
    note: t.note,
    items: lines
      .map((l) => ({ i: one<{ id: number; sku: string; brand_text: string | null; grade_code: string; size_label: string | null; price: number | null; price_manual: number | null; status: string; sub_categories: unknown }>(l.items), qc: Boolean(l.qc) }))
      .filter((x) => x.i)
      .map(({ i, qc }) => ({ id: i!.id, sku: i!.sku, brand: i!.brand_text ?? "", sub_category: one<{ name: string }>(i!.sub_categories)?.name ?? "", grade: i!.grade_code, size_label: i!.size_label, list_price: i!.price_manual ?? i!.price, status: i!.status, qc })),
  };
}
