/**
 * GET /api/pos/item?sku=… — one garment for the till, with today's shelf
 * price computed here from the live settings (list price walked down the
 * ladder by months on the floor), and whether it is listed online.
 */

import { NextResponse } from "next/server";

import { requirePos } from "@/lib/pos/auth";
import { currentPrice, daysOnFloor, type PosItem } from "@/lib/pos/pricing";
import { loadPricingContext } from "@/lib/pricing/repo";

export const instant = false;

export async function GET(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  const sku = new URL(request.url).searchParams.get("sku")?.trim().toUpperCase();
  if (!sku) return NextResponse.json({ error: "sku is required." }, { status: 400 });
  const { db, outletId } = gate;
  const [{ data, error }, ctx] = await Promise.all([
    db.from("items").select("id, sku, brand_text, size_label, colour_tag, status, outlet_id, price, price_manual, floored_on, grade_code, is_rare, shopify_product_id, online_status, sold_at, sold_price, outlets(name), sub_categories(name)").eq("sku", sku).maybeSingle(),
    loadPricingContext(db),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: `No garment with SKU ${sku}.` }, { status: 404 });
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name: string } | null | undefined;
  const listPrice = data.price_manual ?? data.price ?? 0;
  const { stage, price } = currentPrice(listPrice, data.floored_on, ctx.settings);
  const item: PosItem = {
    id: data.id, sku: data.sku, brand: data.brand_text ?? "Unbranded", sub_category: one(data.sub_categories)?.name ?? "", grade: data.grade_code,
    size_label: data.size_label, colour_tag: data.colour_tag, status: data.status, outlet_id: data.outlet_id, outlet: one(data.outlets)?.name ?? null,
    list_price: listPrice, stage, price, days_on_floor: daysOnFloor(data.floored_on), is_rare: data.is_rare,
    online_listed: Boolean(data.shopify_product_id) && data.online_status === "listed",
  };
  if (data.status === "sold") return NextResponse.json({ error: `${sku} was sold${data.sold_at ? ` on ${new Date(data.sold_at).toLocaleDateString("en-PK")}` : ""}${data.sold_price ? ` for Rs ${data.sold_price.toLocaleString()}` : ""}.`, item }, { status: 409 });
  if (data.status === "pulled" || data.status === "returned_damaged") return NextResponse.json({ error: `${sku} is ${data.status === "pulled" ? "pulled from the floor" : "marked damaged"}.`, item }, { status: 409 });
  if (data.status === "rejected") return NextResponse.json({ error: `${sku} was rejected at grading.`, item }, { status: 409 });
  if (!listPrice) return NextResponse.json({ error: `${sku} has no price yet.`, item }, { status: 409 });
  const warnings: string[] = [];
  if (data.outlet_id !== outletId) warnings.push(data.outlet_id ? `Belongs to ${item.outlet ?? "another outlet"} — not received here.` : "Not received at any outlet yet (still at the warehouse).");
  if (data.status === "tagged") warnings.push("Not floored yet — receive its transfer first, or sell with override.");
  return NextResponse.json({ item, warnings, other_outlet: data.outlet_id !== outletId });
}
