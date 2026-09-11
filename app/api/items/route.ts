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

import { audit } from "@/lib/admin/auth";


import { currentStaff, dbFor, requireStaff } from "@/lib/auth/staff";
import { REJECTED, type Adjustment, type GradeCode, meetsOutletMinimum } from "@/lib/pricing/constants";
import { ADJUSTMENTS, GRADE_CODES, quote } from "@/lib/pricing/quote";
import { loadRareReasons, rareReason } from "@/lib/pricing/rare-reasons";
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
  /** Reason codes from lib/pricing/rare-reasons.ts — at least one when is_rare. */
  rare_reasons?: string[];
  /** Optional free text: what sets it apart, in the tagger's words. */
  rare_note?: string | null;
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
  /** Deliberate send-to-outlet of a garment below the outlet minimum; confirmed twice on the form and audited. */
  outlet_override?: boolean;
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
  // Weighing is no longer part of tagging; a weight is accepted only for lots priced by kg with no standard cost.
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

  if (staff.role === "photographer") return NextResponse.json({ error: "Photographers take pictures; tagging is for taggers." }, { status: 403 });
  const q = quote({ subCategory, brand, grade, adjustment, adjustPct, isRare: Boolean(body.is_rare), lot, weightKg: body.weight_kg ?? null }, ctx);
  if (q.error) return bad(q.error);

  const rejected = grade === REJECTED;
  // Rare finds and ultra luxury are handed off: saved with no price, set
  // aside, priced later by a senior with the garment in hand.
  // No hand-off any more: a rare find is priced here (at the senior's price,
  // by hand, when there is one). An ultra-luxury brand cannot be priced by
  // the sheet, so it needs a manual price.
  const isRare = Boolean(body.is_rare);
  const reasonList = isRare ? await loadRareReasons(supabase) : [];
  const rareReasons = isRare ? [...new Set((body.rare_reasons ?? []).filter((c) => rareReason(c, reasonList)))].slice(0, 1) : [];
  const rareNote = (body.rare_note ?? "").trim().slice(0, 160);
  if (isRare && !rareReasons.length) return bad("Choose why it is a rare find — the reason prints on the tag.");
  const blocked = !rejected && Boolean(q.block_reason);
  if (blocked && body.price_manual == null) return bad(`${q.block_reason} Set the price by hand.`);

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

  // Outlets take only the better conditions. Under the outlet channel a
  // garment below the minimum is not tagged at all: no SKU, no price, no
  // tag. It goes on the pile for online tagging later.
  const channel = body.channel === "online" ? "online" : "outlet";
  const belowOutletMin = channel === "outlet" && !rejected && !meetsOutletMinimum(grade, ctx.settings.outletMinGrade);
  const outletOverride = belowOutletMin && body.outlet_override === true;
  if (belowOutletMin && !outletOverride) {
    return bad(`${GRADE_NAMES[grade]} does not go to outlets (minimum ${GRADE_NAMES[ctx.settings.outletMinGrade]}). Do not tag it here — put it on the Very Good pile for online tagging.`);
  }

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
      is_rare: isRare,
      rare_reasons: rareReasons,
      rare_note: isRare && rareNote ? rareNote : null,
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
      price: rejected ? 0 : blocked ? null : q.price,
      price_manual: manual ? body.price_manual : null,
      settings_version: ctx.settingsVersion,
      status: rejected ? "rejected" : "tagged",
      channel,
      outlet_override: outletOverride,
      online_status: channel === "online" ? "draft" : null,
    })
    .select("id, sku, price, price_manual, status, tagged_at, weight_kg")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  if (outletOverride) await audit(supabase, staff.id, "items", item.sku, { outlet_override: false }, { outlet_override: true }, `${GRADE_NAMES[grade]} sent to outlets on purpose (minimum ${GRADE_NAMES[ctx.settings.outletMinGrade]})`);

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
const GRADE_NAMES: Record<GradeCode, string> = { bnwt: "Brand New with Tags", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
