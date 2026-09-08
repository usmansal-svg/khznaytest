/**
 * POST /api/items — save a tagged garment and allocate its SKU atomically.
 * GET  /api/items?q=… — search by SKU, brand or sub-category (spec 12.5).
 *
 * The price is recomputed here from the database context; whatever the
 * form displayed is never trusted. Ultra-luxury and rare pieces must carry
 * a manual price.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { type Adjustment, type GradeCode } from "@/lib/pricing/constants";
import { computePrice } from "@/lib/pricing/engine";
import { loadPricingContext, resolveBrandDb } from "@/lib/pricing/repo";
import { SEASONS, WEARERS, buildSku, type Season, type Wearer } from "@/lib/pricing/sku";

const GRADE_CODES: GradeCode[] = ["bnwt", "premium", "excellent", "very_good"];
const ADJUSTMENTS: Adjustment[] = ["below", "standard", "above"];

type Body = {
  sub_category_id?: string;
  brand_text?: string;
  grade?: string;
  adjustment?: string;
  is_rare?: boolean;
  is_unsure?: boolean;
  flaw_note?: string | null;
  season?: string;
  wearer?: string;
  size_label?: string | null;
  colour?: string | null;
  fabric?: string | null;
  measurements?: Record<string, number | string> | null;
  outlet_id?: number | null;
  lot_code?: string | null;
  supplier?: string | null;
  price_manual?: number | null;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in to save items." }, { status: 401 });

  const grade = (body.grade ?? "premium") as GradeCode;
  const adjustment = (body.adjustment ?? "standard") as Adjustment;
  const season = body.season as Season;
  const wearer = body.wearer as Wearer;
  if (!GRADE_CODES.includes(grade)) return bad(`Unknown grade: ${body.grade}`);
  if (!ADJUSTMENTS.includes(adjustment)) return bad(`Unknown adjustment: ${body.adjustment}`);
  if (!SEASONS.includes(season)) return bad(`Season must be one of ${SEASONS.join(", ")}.`);
  if (!WEARERS.includes(wearer)) return bad(`Wearer must be one of ${WEARERS.join(", ")}.`);
  if (body.price_manual != null && (!Number.isInteger(body.price_manual) || body.price_manual <= 0)) {
    return bad("Manual price must be a whole, positive rupee amount.");
  }

  const [ctx, brand, staffRes] = await Promise.all([
    loadPricingContext(supabase),
    resolveBrandDb(supabase, body.brand_text),
    supabase.rpc("ensure_staff"),
  ]);
  if (staffRes.error) return NextResponse.json({ error: staffRes.error.message }, { status: 500 });
  const staff = staffRes.data as { id: number; name: string; role: string };

  const subCategory = ctx.subCategories.find((s) => s.slug === body.sub_category_id);
  if (!subCategory) return bad(`Unknown sub_category_id: ${body.sub_category_id ?? "(missing)"}`);

  const result = computePrice(
    {
      weightKg: subCategory.weightKg,
      profileCode: subCategory.profileCode,
      valueIndex: subCategory.valueIndex,
      perPieceShare: subCategory.perPieceShare,
      perPieceCost: subCategory.perPieceCost ?? undefined,
      gradeCode: grade,
      tier: brand.tier,
      adjustment,
    },
    ctx.settings,
    ctx.refs,
  );

  const blocked = Boolean(body.is_rare) || Boolean(result.blockReason);
  if (blocked && body.price_manual == null) {
    return bad(body.is_rare ? "Rare pieces need a manual price." : "Ultra luxury needs a manual price.");
  }

  // Optional lot: create on first use so the datalist grows as bales arrive.
  let lotId: number | null = null;
  const lotCode = body.lot_code?.trim();
  if (lotCode) {
    const { data: lot, error } = await supabase
      .from("lots")
      .upsert({ code: lotCode, supplier: body.supplier?.trim() || lotCode }, { onConflict: "code", ignoreDuplicates: false })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: `Lot: ${error.message}` }, { status: 500 });
    lotId = lot.id;
  }

  const { data: seq, error: seqError } = await supabase.rpc("next_sku_seq");
  if (seqError || typeof seq !== "number") {
    return NextResponse.json({ error: `Could not allocate a SKU: ${seqError?.message ?? "no sequence"}` }, { status: 500 });
  }
  const sku = buildSku(season, wearer, subCategory.code, seq);

  const { data: item, error: insertError } = await supabase
    .from("items")
    .insert({
      sku,
      lot_id: lotId,
      outlet_id: body.outlet_id ?? null,
      tagged_by: staff.id,
      sub_category_slug: subCategory.slug,
      brand_id: brand.id,
      brand_text: brand.name || null,
      brand_tier: brand.tier,
      grade_code: grade,
      is_rare: Boolean(body.is_rare),
      is_unsure: Boolean(body.is_unsure),
      flaw_note: body.flaw_note?.trim() || null,
      season,
      wearer,
      size_label: body.size_label?.trim() || null,
      colour: body.colour?.trim() || null,
      fabric: body.fabric?.trim() || null,
      measurements: body.measurements ?? {},
      adjustment,
      landed_cost: Math.round(result.landedCost * 100) / 100,
      price: blocked ? null : result.price,
      price_manual: blocked ? body.price_manual : null,
      settings_version: ctx.settingsVersion,
      status: blocked ? "set_aside" : "tagged",
    })
    .select("id, sku, price, price_manual, status, tagged_at")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({
    item: {
      ...item,
      list_price: item.price_manual ?? item.price,
      brand: brand.name,
      sub_category: subCategory.name,
      tagged_by: staff.name,
    },
    markdowns: blocked ? [] : result.markdowns,
    pricing_source: ctx.source,
  });
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const supabase = await createClient();

  let query = supabase
    .from("items")
    .select("id, sku, brand_text, grade_code, size_label, colour_tag, status, price, price_manual, tagged_at, sub_categories(name)")
    .order("tagged_at", { ascending: false })
    .limit(50);

  if (q) {
    // SKU prefix, brand substring, or sub-category name via a two-step lookup.
    const { data: subs } = await supabase.from("sub_categories").select("slug").ilike("name", `%${q}%`);
    const slugs = (subs ?? []).map((s) => s.slug);
    const ors = [`sku.ilike.${q.toUpperCase()}%`, `brand_text.ilike.%${q}%`];
    if (slugs.length) ors.push(`sub_category_slug.in.(${slugs.join(",")})`);
    query = query.or(ors.join(","));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name: string } | null | undefined;
  return NextResponse.json({
    items: (data ?? []).map((r) => ({
      id: r.id,
      sku: r.sku,
      brand: r.brand_text ?? "",
      sub_category: one(r.sub_categories)?.name ?? "",
      grade: r.grade_code,
      size_label: r.size_label,
      colour_tag: r.colour_tag,
      status: r.status,
      list_price: r.price_manual ?? r.price,
      tagged_at: r.tagged_at,
    })),
  });
}

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });
