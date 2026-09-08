/**
 * GET /api/items/:sku — one garment with everything the shelf tag needs.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { markdownLadder } from "@/lib/pricing/engine";
import { loadPricingContext } from "@/lib/pricing/repo";
import { MEASUREMENT_FIELDS, type MeasureType } from "@/lib/pricing/sub-categories";

export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku: raw } = await params;
  const sku = decodeURIComponent(raw).trim().toUpperCase();
  const supabase = await createClient();

  const [{ data, error }, ctx] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, sku, brand_text, brand_tier, grade_code, is_rare, flaw_note, season, wearer, size_label, colour, fabric, measurements, adjustment, colour_tag, floored_on, landed_cost, price, price_manual, status, tagged_at, outlets(name), sub_categories(name, code, measure_type, market_price, categories(name))",
      )
      .eq("sku", sku)
      .maybeSingle(),
    loadPricingContext(supabase),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: `No item with SKU ${sku}.` }, { status: 404 });

  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const sub = one<{ name: string; code: string; measure_type: MeasureType; market_price: number | null; categories: unknown }>(data.sub_categories);
  const category = one<{ name: string }>(sub?.categories);
  const outlet = one<{ name: string }>(data.outlets);
  const listPrice = data.price_manual ?? data.price ?? 0;

  return NextResponse.json({
    item: {
      id: data.id,
      sku: data.sku,
      brand: data.brand_text ?? "Unbranded",
      brand_tier: data.brand_tier,
      category: category?.name ?? "",
      sub_category: sub?.name ?? "",
      sub_category_code: sub?.code ?? "",
      market_price: sub?.market_price ?? null,
      measure_fields: sub ? MEASUREMENT_FIELDS[sub.measure_type] : [],
      grade: data.grade_code,
      is_rare: data.is_rare,
      flaw_note: data.flaw_note,
      season: data.season,
      wearer: data.wearer,
      size_label: data.size_label,
      colour: data.colour,
      fabric: data.fabric,
      measurements: data.measurements ?? {},
      adjustment: data.adjustment,
      colour_tag: data.colour_tag,
      floored_on: data.floored_on,
      outlet: outlet?.name ?? null,
      landed_cost: Number(data.landed_cost),
      list_price: listPrice,
      status: data.status,
      tagged_at: data.tagged_at,
    },
    markdowns: listPrice ? markdownLadder(listPrice, ctx.settings) : [],
  });
}
