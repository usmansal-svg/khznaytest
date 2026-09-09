/**
 * POST /api/items — save a tagged garment and allocate its SKU atomically.
 * GET  /api/items?q=… — search by SKU, brand or sub-category.
 *
 * Every garment is a record, rejects included — that is how the reject rate
 * becomes measured rather than assumed. The price is recomputed here from
 * the lot, the scale weight and the database context; whatever the form
 * displayed is never trusted.
 */

import { NextResponse } from "next/server";

import { currentStaff, dbFor, requireStaff } from "@/lib/auth/staff";
import { REJECTED, type Adjustment, type GradeCode } from "@/lib/pricing/constants";
import { ADJUSTMENTS, GRADE_CODES, quote } from "@/lib/pricing/quote";
import { loadLot, loadPricingContext, resolveBrandDb } from "@/lib/pricing/repo";
import { SEASONS, WEARERS, buildSku, type Season, type Wearer } from "@/lib/pricing/sku";

type Body = {
  sub_category_id?: string;
  brand_text?: string;
  grade?: string;
  adjustment?: string;
  adjust_pct?: number;
  below_reason?: string | null;
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
  lot_id?: number | null;
  weight_kg?: number | null;
  price_manual?: number | null;
  channel?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  const { staff, db: supabase } = gate;

  const grade = (body.grade ?? "premium") as GradeCode;
  const adjustment = (body.adjustment ?? "standard") as Adjustment;
  const season = body.season as Season;
  if (!GRADE_CODES.includes(grade)) return bad(`Unknown grade: ${body.grade}`);
  if (!ADJUSTMENTS.includes(adjustment)) return bad(`Unknown adjustment: ${body.adjustment}`);
  const adjustPct = body.adjust_pct == null ? 0 : Number(body.adjust_pct);
  if (!(Number.isInteger(adjustPct) && adjustPct % 5 === 0 && adjustPct >= -50 && adjustPct <= 100)) return bad("Price steps must be multiples of 5% between -50% and +100%.");
  if (!SEASONS.includes(season)) return bad(`Season must be one of ${SEASONS.join(", ")}.`);
  if (body.lot_id == null) return bad("Pick the lot the garment came from.");
  if (body.weight_kg != null && !(typeof body.weight_kg === "number" && body.weight_kg > 0 && body.weight_kg < 50)) {
    return bad("weight_kg must be a positive number of kilograms.");
  }
  if (body.price_manual != null && (!Number.isInteger(body.price_manual) || body.price_manual <= 0)) {
    return bad("Manual price must be a whole, positive rupee amount.");
  }

  const ctx = await loadPricingContext(supabase);
  const [brand, lot] = await Promise.all([resolveBrandDb(supabase, body.brand_text), loadLot(supabase, Number(body.lot_id), ctx.settings)]);
  if (!lot) return bad(`Unknown lot: ${body.lot_id}`);
  if (lot.status === "split") return bad(`Lot ${lot.code} was split into piles — tag from one of its children.`);
  if (lot.status !== "open") return bad(`Lot ${lot.code} is closed — reopen it to tag from it.`);

  const subCategory = ctx.subCategories.find((s) => s.slug === body.sub_category_id);
  if (!subCategory) return bad(`Unknown category: ${body.sub_category_id ?? "(missing)"}`);
  // The category's gender is the garment's wearer; it drives the SKU letter.
  const wearer = (WEARERS.includes(subCategory.gender as Wearer) ? subCategory.gender : "unisex") as Wearer;

  const q = quote({ subCategory, brand, grade, adjustment, adjustPct, isRare: Boolean(body.is_rare), lot, weightKg: body.weight_kg ?? null }, ctx);
  if (q.error) return bad(q.error);

  const rejected = grade === REJECTED;
  const blocked = !rejected && Boolean(q.block_reason);
  if (blocked && body.price_manual == null) {
    return bad(body.is_rare ? "Rare pieces need a manual price." : "Ultra luxury needs a manual price.");
  }

  // Under-pricing: any final price below the pricing sheet's standard price
  // at this grade needs a reason and is logged with the tagger's name.
  const manual = body.price_manual != null;
  const finalPrice = rejected ? 0 : manual ? Number(body.price_manual) : q.price ?? 0;
  const standardPrice = rejected ? 0 : q.standard_price ?? 0;
  const below = !rejected && !blocked && standardPrice > 0 && finalPrice < standardPrice;
  const belowReason = body.below_reason?.trim() || null;
  if (below && !belowReason) return bad(`This is ${Math.round(((standardPrice - finalPrice) / standardPrice) * 100)}% below the pricing sheet (Rs ${standardPrice.toLocaleString()}). Give a reason — it is logged.`);

  // A brand nobody has listed yet is added now, as Regular, marked as
  // coming from a tagger so a manager can set its tier.
  let brandId = brand.id;
  if (!brandId && brand.name) {
    const { data: created, error: brandErr } = await supabase
      .from("brands")
      .upsert({ name: brand.name, tier: "regular", active: true, source: "tagger", added_by: staff.id }, { onConflict: "name", ignoreDuplicates: false })
      .select("id")
      .single();
    if (!brandErr && created) brandId = created.id;
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
      lot_id: lot.id,
      outlet_id: body.outlet_id ?? null,
      tagged_by: staff.id,
      sub_category_slug: subCategory.slug,
      brand_id: brandId,
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
      weight_kg: q.weight_kg,
      adjustment: adjustPct > 0 ? "above" : adjustPct < 0 ? "below" : "standard",
      adjust_pct: adjustPct,
      standard_price: rejected ? 0 : q.standard_price,
      below_reason: below ? belowReason : null,
      landed_cost: q.landed_cost,
      price: blocked ? null : rejected ? 0 : q.price,
      price_manual: blocked || manual ? body.price_manual : null,
      settings_version: ctx.settingsVersion,
      status: rejected ? "rejected" : blocked ? "set_aside" : "tagged",
      channel: body.channel === "online" ? "online" : "outlet",
      online_status: body.channel === "online" ? "draft" : null,
    })
    .select("id, sku, price, price_manual, status, tagged_at, weight_kg")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Random QC hold-back: the tagger is told to set this one aside for a
  // blind regrade. Decided here, after the save, so it cannot be gamed.
  const qcHold = !rejected && Math.random() < ctx.settings.qcSampleRate;
  if (qcHold) await supabase.from("items").update({ qc_hold: true }).eq("id", item.id);

  if (below) {
    await supabase.from("price_alerts").insert({
      item_id: item.id, sku: item.sku, tagged_by: staff.id, standard_price: standardPrice, final_price: finalPrice,
      pct_below: Math.round(((standardPrice - finalPrice) / standardPrice) * 1000) / 10, kind: manual ? "manual" : "adjustment", reason: belowReason,
    });
  }

  return NextResponse.json({
    qc_hold: qcHold,
    below_standard: below,
    item: { ...item, list_price: item.price_manual ?? item.price, brand: brand.name, sub_category: subCategory.name, lot: lot.code, tagged_by: staff.name },
    markdowns: q.markdowns,
    pricing_source: ctx.source,
  });
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const supabase = await dbFor(await currentStaff());

  let query = supabase
    .from("items")
    .select("id, sku, brand_text, grade_code, size_label, colour_tag, status, price, price_manual, weight_kg, tagged_at, sub_categories(name), lots(code)")
    .order("tagged_at", { ascending: false })
    .limit(50);

  if (q) {
    const { data: subs } = await supabase.from("sub_categories").select("slug").ilike("name", `%${q}%`);
    const slugs = (subs ?? []).map((s) => s.slug);
    const ors = [`sku.ilike.${q.toUpperCase()}%`, `brand_text.ilike.%${q}%`];
    if (slugs.length) ors.push(`sub_category_slug.in.(${slugs.join(",")})`);
    query = query.or(ors.join(","));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  return NextResponse.json({
    items: (data ?? []).map((r) => ({
      id: r.id,
      sku: r.sku,
      brand: r.brand_text ?? "",
      sub_category: one<{ name: string }>(r.sub_categories)?.name ?? "",
      lot: one<{ code: string }>(r.lots)?.code ?? null,
      grade: r.grade_code,
      size_label: r.size_label,
      weight_kg: r.weight_kg,
      colour_tag: r.colour_tag,
      status: r.status,
      list_price: r.price_manual ?? r.price,
      tagged_at: r.tagged_at,
    })),
  });
}

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });
