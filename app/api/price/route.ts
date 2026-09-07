/**
 * POST /api/price — compute a price without saving it.
 *
 * This is the single source of pricing truth (section 13). The tagging form
 * must never compute a price client-side: if it does, the browser and the
 * server will disagree the first time settings change.
 */

import { NextResponse } from "next/server";

import { DEFAULT_SETTINGS, SETTINGS_VERSION, type Adjustment, type GradeCode } from "@/lib/pricing/constants";
import { computePrice } from "@/lib/pricing/engine";
import { resolveBrand } from "@/lib/pricing/brands";
import { SUB_CATEGORIES } from "@/lib/pricing/sub-categories";

const GRADE_CODES: GradeCode[] = ["bnwt", "premium", "excellent", "very_good"];
const ADJUSTMENTS: Adjustment[] = ["below", "standard", "above"];

type Body = {
  sub_category_id?: string;
  grade?: string;
  brand_text?: string;
  brand_id?: string;
  adjustment?: string;
  is_rare?: boolean;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const subCategory = SUB_CATEGORIES.find((s) => s.slug === body.sub_category_id);
  if (!subCategory) {
    return NextResponse.json({ error: `Unknown sub_category_id: ${body.sub_category_id ?? "(missing)"}` }, { status: 400 });
  }

  const grade = (body.grade ?? "premium") as GradeCode;
  if (!GRADE_CODES.includes(grade)) {
    return NextResponse.json({ error: `Unknown grade: ${body.grade}` }, { status: 400 });
  }

  const adjustment = (body.adjustment ?? "standard") as Adjustment;
  if (!ADJUSTMENTS.includes(adjustment)) {
    return NextResponse.json({ error: `Unknown adjustment: ${body.adjustment}` }, { status: 400 });
  }

  const brand = resolveBrand(body.brand_text ?? body.brand_id);

  const result = computePrice({
    weightKg: subCategory.weightKg,
    profileCode: subCategory.profileCode,
    valueIndex: subCategory.valueIndex,
    perPieceShare: subCategory.perPieceShare,
    perPieceCost: subCategory.perPieceCost ?? undefined,
    gradeCode: grade,
    tier: brand.tier,
    adjustment,
  });

  // A rare piece is priced by hand even when the brand is priceable — two or
  // more special triggers send it to the Set Aside rail (section 7.2).
  const blockReason = body.is_rare
    ? "Rare piece — set aside and price by hand against resale listings."
    : result.blockReason;

  const warnings = [brand.warning].filter(Boolean);
  if (result.price > DEFAULT_SETTINGS.highValueThreshold) {
    warnings.push(`Above PKR ${DEFAULT_SETTINGS.highValueThreshold.toLocaleString()} — goes to the QC review queue.`);
  }

  return NextResponse.json({
    sub_category: { id: subCategory.slug, name: subCategory.name, measure_type: subCategory.measureType },
    landed_cost: round2(result.landedCost),
    price: blockReason ? null : result.price,
    premium_price: blockReason ? null : result.premiumPrice,
    grade_prices: blockReason ? null : result.gradePrices,
    markdowns: blockReason ? [] : result.markdowns,
    gp_pct: blockReason ? null : round4(result.gpPct),
    brand: { name: brand.name, tier: brand.tier, matched: brand.matched },
    brand_tier: brand.tier,
    grade,
    adjustment,
    multiple: round4(result.multiple),
    settings_version: SETTINGS_VERSION,
    ...(blockReason ? { block_reason: blockReason } : {}),
    ...(warnings.length ? { warnings } : {}),
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
