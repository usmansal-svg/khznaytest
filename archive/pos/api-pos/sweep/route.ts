/** GET /api/pos/sweep — this month's sticker list and pull list for the outlet (spec section 5). */
import { NextResponse } from "next/server";

import { requirePos } from "@/lib/pos/auth";
import { sweep, type FloorItem } from "@/lib/pricing/floor";
import { loadPricingContext } from "@/lib/pricing/repo";

export const instant = false;

export async function GET(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  const { db, outletId } = gate;
  const [{ data, error }, ctx] = await Promise.all([
    db.from("items").select("id, sku, outlet_id, brand_text, size_label, price, price_manual, floored_on, colour_tag, status, sub_categories(name)").eq("outlet_id", outletId).eq("status", "on_floor").limit(5000),
    loadPricingContext(db),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const items: FloorItem[] = (data ?? []).map((i) => ({ id: i.id, sku: i.sku, outlet_id: i.outlet_id, sub_category: one<{ name: string }>(i.sub_categories)?.name ?? "", brand: i.brand_text ?? "", size_label: i.size_label, list_price: i.price_manual ?? i.price ?? 0, floored_on: i.floored_on, colour_tag: i.colour_tag, status: i.status }));
  return NextResponse.json(sweep(items, ctx.settings));
}

/** POST /api/pos/sweep { pull: [sku…] } — mark garments pulled after the sweep. */
export async function POST(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  if (!gate.canManage) return NextResponse.json({ error: "Only an outlet manager pulls stock." }, { status: 403 });
  let body: { pull?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body must be JSON." }, { status: 400 }); }
  const skus = (body.pull ?? []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  if (!skus.length) return NextResponse.json({ error: "Nothing to pull." }, { status: 400 });
  const { error, count } = await gate.db.from("items").update({ status: "pulled" }, { count: "exact" }).in("sku", skus).eq("outlet_id", gate.outletId).eq("status", "on_floor");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pulled: count ?? 0 });
}
