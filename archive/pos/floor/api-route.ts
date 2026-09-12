/**
 * GET  /api/floor?outlet_id=…   this month's colour; the stockroom (received,
 *                               not yet floored); the sticker sweep; garments due to be pulled
 * POST /api/floor { action: "floor" | "pull", outlet_id, skus?: [] }
 *
 * Flooring is its own step after receiving (12 Sep): a garment received on
 * 1 January and floored on 5 January is floored on 5 January — that is the
 * date the colour is chosen from and the markdown clock starts. Floor stamps
 * floored_on (Pakistan date), the colour and who floored it, and moves the
 * garment stockroom → on_floor; only received garments can be floored. Pull
 * marks four-colour-old stock pulled. Both act on the whole outlet unless a
 * SKU list is given.
 */

import { NextResponse } from "next/server";

import { currentStaff, dbFor, requireStaff } from "@/lib/auth/staff";
import { colourForMonth } from "@/lib/pricing/engine";
import { sweep, type FloorItem } from "@/lib/pricing/floor";
import { loadPricingContext } from "@/lib/pricing/repo";

const SELECT = "id, sku, outlet_id, brand_text, size_label, price, price_manual, floored_on, colour_tag, status, received_at, shopify_product_id, stage_override, pull_requested, sub_categories(name)";
const pkDate = (d = new Date()) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);

function toFloorItem(r: Record<string, unknown>): FloorItem {
  const sub = Array.isArray(r.sub_categories) ? r.sub_categories[0] : r.sub_categories;
  return {
    id: r.id as number,
    sku: r.sku as string,
    outlet_id: (r.outlet_id as number | null) ?? null,
    sub_category: (sub as { name: string } | null)?.name ?? "",
    brand: (r.brand_text as string | null) ?? "",
    size_label: (r.size_label as string | null) ?? null,
    list_price: Number((r.price_manual as number | null) ?? (r.price as number | null) ?? 0),
    floored_on: (r.floored_on as string | null) ?? null,
    colour_tag: (r.colour_tag as string | null) ?? null,
    status: r.status as string,
    stage_override: (r.stage_override as FloorItem["stage_override"]) ?? null,
    pull_requested: Boolean(r.pull_requested),
  };
}

export async function GET(request: Request) {
  const supabase = await dbFor(await currentStaff());
  const outletId = Number(new URL(request.url).searchParams.get("outlet_id"));
  if (!Number.isInteger(outletId) || outletId <= 0) return NextResponse.json({ error: "outlet_id is required." }, { status: 400 });
  const ctx = await loadPricingContext(supabase);
  const { data, error } = await supabase.from("items").select(SELECT).eq("outlet_id", outletId).in("status", ["tagged", "on_floor"]).order("sku");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = (data ?? []).map((r) => toFloorItem(r as Record<string, unknown>));
  const raw = (data ?? []) as Record<string, unknown>[];
  const pending = items.filter((i, n) => i.status === "tagged" && raw[n].received_at);
  const today = pkDate();
  const s = sweep(items, ctx.settings);
  return NextResponse.json({
    colour: s.colour,
    today,
    pending: pending.map(({ id, sku, brand, sub_category, size_label, list_price }) => ({ id, sku, brand, sub_category, size_label, list_price, received_at: raw.find((r) => r.id === id)?.received_at ?? null })),
    floored_today: items.filter((i) => i.status === "on_floor" && i.floored_on === today).map((i) => ({ id: i.id, sku: i.sku, brand: i.brand, sub_category: i.sub_category, size_label: i.size_label, list_price: i.list_price, colour_tag: i.colour_tag, on_shopify: Boolean(raw.find((r) => r.id === i.id)?.shopify_product_id) })),
    in_transit: (await supabase.from("transfers").select("id", { count: "exact", head: true }).eq("to_outlet_id", outletId).in("status", ["dispatched", "receiving"])).count ?? 0,
    stickers: s.stickers.map((l) => ({ id: l.id, sku: l.sku, brand: l.brand, sub_category: l.sub_category, size_label: l.size_label, list_price: l.list_price, colour_tag: l.colour_tag, stage: l.stage, sticker: l.sticker, price_today: l.price_today })),
    to_pull: s.to_pull.map((i) => ({ id: i.id, sku: i.sku, brand: i.brand, sub_category: i.sub_category, size_label: i.size_label, list_price: i.list_price, colour_tag: i.colour_tag, floored_on: i.floored_on })),
    on_floor: items.filter((i) => i.status === "on_floor").length,
  });
}

export async function POST(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  let body: { action?: string; outlet_id?: number; skus?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const outletId = Number(body.outlet_id);
  if (!Number.isInteger(outletId) || outletId <= 0) return NextResponse.json({ error: "outlet_id is required." }, { status: 400 });
  const db = gate.db;
  const skus = body.skus?.map((s) => s.trim().toUpperCase()).filter(Boolean);

  if (body.action === "floor") {
    const today = new Date();
    if (skus?.length) {
      // Scanned one by one: say exactly why a scan did not floor.
      const { data: found } = await db.from("items").select("sku, status, outlet_id, received_at, floored_on").in("sku", skus);
      const refused: string[] = [];
      const ok: string[] = [];
      for (const sku of skus) {
        const it = (found ?? []).find((f) => f.sku === sku);
        if (!it) refused.push(`${sku}: no such SKU`);
        else if (it.status === "on_floor") refused.push(`${sku}: already on the floor since ${it.floored_on}`);
        else if (it.status !== "tagged") refused.push(`${sku}: is ${it.status.replace("_", " ")}`);
        else if (it.outlet_id !== outletId) refused.push(`${sku}: belongs to another outlet`);
        else if (!it.received_at) refused.push(`${sku}: not received yet — scan it in on its transfer first`);
        else ok.push(sku);
      }
      if (ok.length) {
        const { error } = await db.from("items").update({ status: "on_floor", floored_on: pkDate(today), colour_tag: colourForMonth(today), floored_by: gate.staff.id }).in("sku", ok).eq("status", "tagged");
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ floored: ok.length, skus: ok, refused, colour: colourForMonth(today) });
    }
    const { data, error } = await db.from("items").update({ status: "on_floor", floored_on: pkDate(today), colour_tag: colourForMonth(today), floored_by: gate.staff.id }).eq("outlet_id", outletId).eq("status", "tagged").not("received_at", "is", null).select("sku");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ floored: data?.length ?? 0, skus: (data ?? []).map((d) => d.sku), refused: [], colour: colourForMonth(today) });
  }

  if (body.action === "pull") {
    const ctx = await loadPricingContext(db);
    const { data } = await db.from("items").select(SELECT).eq("outlet_id", outletId).eq("status", "on_floor");
    const due = sweep((data ?? []).map((r) => toFloorItem(r as Record<string, unknown>)), ctx.settings).to_pull;
    const ids = due.filter((i) => !skus?.length || skus.includes(i.sku)).map((i) => i.id);
    if (!ids.length) return NextResponse.json({ pulled: 0 });
    const { error } = await db.from("items").update({ status: "pulled" }).in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pulled: ids.length });
  }

  return NextResponse.json({ error: "action must be floor or pull." }, { status: 400 });
}
