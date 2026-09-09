/**
 * GET /api/items/:sku — one garment with everything the shelf tag needs.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { markdownLadder } from "@/lib/pricing/engine";
import { loadPricingContext } from "@/lib/pricing/repo";
import { MEASUREMENT_FIELDS, type MeasureType } from "@/lib/pricing/sub-categories";
import { shopifyTags, shopifyTitle } from "@/lib/shopify/tags";

export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku: raw } = await params;
  const sku = decodeURIComponent(raw).trim().toUpperCase();
  const supabase = await createClient();

  const [{ data, error }, ctx] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, sku, brand_text, brand_tier, grade_code, is_rare, flaw_note, season, wearer, size_label, colour, fabric, measurements, weight_kg, adjustment, colour_tag, floored_on, landed_cost, price, price_manual, status, tagged_at, outlet_id, channel, photos, description, online_status, shopify_product_id, shopify_handle, shopify_tags, shopify_synced_at, shopify_error, outlets(name), lots(code), sub_categories(name, code, measure_type, market_price, categories(name))",
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

  const taggable = {
    wearer: data.wearer, season: data.season, category: category?.name ?? "", sub_category: sub?.name ?? "", brand: data.brand_text,
    brand_tier: data.brand_tier, grade: data.grade_code, size_label: data.size_label, colour: data.colour, fabric: data.fabric, is_rare: data.is_rare,
  };

  return NextResponse.json({
    shopify_preview: { title: shopifyTitle(taggable), tags: shopifyTags(taggable) },
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
      outlet_id: data.outlet_id,
      lot: one<{ code: string }>(data.lots)?.code ?? null,
      weight_kg: data.weight_kg,
      channel: data.channel,
      photos: data.photos ?? [],
      description: data.description,
      online_status: data.online_status,
      shopify: { product_id: data.shopify_product_id, handle: data.shopify_handle, tags: data.shopify_tags, synced_at: data.shopify_synced_at, error: data.shopify_error },
      landed_cost: Number(data.landed_cost),
      list_price: listPrice,
      status: data.status,
      tagged_at: data.tagged_at,
    },
    markdowns: listPrice ? markdownLadder(listPrice, ctx.settings) : [],
  });
}

/**
 * PATCH /api/items/:sku — { outlet_id?, channel?, description?, online_status? }
 * Where the garment goes and how it is sold. Price is never edited here.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku: raw } = await params;
  const sku = decodeURIComponent(raw).trim().toUpperCase();
  let body: { outlet_id?: number | null; channel?: string; description?: string | null; online_status?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in to change items." }, { status: 401 });

  const patch: Record<string, unknown> = {};
  if ("outlet_id" in body) patch.outlet_id = body.outlet_id ?? null;
  if ("channel" in body) {
    if (body.channel !== "outlet" && body.channel !== "online") return NextResponse.json({ error: "channel must be outlet or online." }, { status: 400 });
    patch.channel = body.channel;
    if (body.channel === "online" && !("online_status" in body)) patch.online_status = "draft";
  }
  if ("description" in body) patch.description = body.description?.trim() || null;
  if ("online_status" in body) {
    if (body.online_status != null && !["draft", "ready", "listed", "unlisted"].includes(body.online_status)) return NextResponse.json({ error: "Bad online_status." }, { status: 400 });
    patch.online_status = body.online_status;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { data, error } = await supabase.from("items").update(patch).eq("sku", sku).select("sku, outlet_id, channel, description, online_status").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: `No item with SKU ${sku}.` }, { status: 404 });
  return NextResponse.json({ item: data });
}
