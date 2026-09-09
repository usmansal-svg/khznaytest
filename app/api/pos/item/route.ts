/**
 * GET /api/pos/item?sku=... — look up one garment for the till.
 * Returns today's shelf price (list price walked down the colour ladder).
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { currentPrice, type PosItem } from "@/lib/pos/pricing";

export async function GET(request: Request) {
  const sku = new URL(request.url).searchParams.get("sku")?.trim().toUpperCase();
  if (!sku) return NextResponse.json({ error: "sku is required." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, sku, brand_text, size_label, colour_tag, status, price, price_manual, floored_on, grade_code, brands(name), sub_categories(name)",
    )
    .eq("sku", sku)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: `No item with SKU ${sku}.` }, { status: 404 });

  // Joined rows come back typed as arrays; both are single-row foreign keys.
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name: string } | null | undefined;
  const brand = one(data.brands)?.name ?? data.brand_text ?? "Unbranded";
  const subCategory = one(data.sub_categories)?.name ?? "";
  const listPrice = data.price_manual ?? data.price ?? 0;
  const { stage, price } = currentPrice(listPrice, data.floored_on);

  const item: PosItem = {
    id: data.id,
    sku: data.sku,
    brand,
    sub_category: subCategory,
    grade: data.grade_code,
    size_label: data.size_label,
    colour_tag: data.colour_tag,
    status: data.status,
    list_price: listPrice,
    stage,
    price,
  };

  if (data.status === "sold") {
    return NextResponse.json({ error: `${sku} was already sold.`, item }, { status: 409 });
  }
  if (data.status === "pulled") {
    return NextResponse.json({ error: `${sku} has been pulled from the floor.`, item }, { status: 409 });
  }
  return NextResponse.json({ item });
}
