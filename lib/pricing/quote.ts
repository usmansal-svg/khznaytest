/**
 * A price quote for one garment — the pure core of POST /api/price and the
 * pre-save check in POST /api/items. Takes an already-loaded context so it
 * can be unit tested with the code defaults and no database.
 */

import { type Adjustment, type GradeCode } from "./constants";
import { computePrice } from "./engine";
import type { BrandResolution, DbSubCategory, PricingContext } from "./repo";

export const GRADE_CODES: GradeCode[] = ["bnwt", "premium", "excellent", "very_good"];
export const ADJUSTMENTS: Adjustment[] = ["below", "standard", "above"];

export type QuoteInput = {
  subCategory: DbSubCategory;
  brand: BrandResolution;
  grade: GradeCode;
  adjustment: Adjustment;
  isRare: boolean;
};

export type Quote = {
  sub_category: { id: string; code: string; name: string; measure_type: string };
  landed_cost: number;
  price: number | null;
  premium_price: number | null;
  grade_prices: Record<GradeCode, number> | null;
  markdowns: { stage: string; discount: number; price: number }[];
  gp_pct: number | null;
  brand: { id: number | null; name: string; tier: string; matched: boolean };
  brand_tier: string;
  grade: GradeCode;
  adjustment: Adjustment;
  multiple: number;
  settings_version: number;
  pricing_source: PricingContext["source"];
  block_reason?: string;
  warnings?: string[];
};

export function quote(input: QuoteInput, ctx: PricingContext): Quote {
  const { subCategory, brand, grade, adjustment, isRare } = input;

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

  // A rare piece is priced by hand even when the brand is priceable — two or
  // more special triggers send it to the Set Aside rail (section 7.2).
  const blockReason = isRare ? "Rare piece — set aside and price by hand against resale listings." : result.blockReason;

  const warnings = [brand.warning, ctx.warning].filter((w): w is string => Boolean(w));
  if (!blockReason && result.price > ctx.settings.highValueThreshold) {
    warnings.push(`Above Rs ${ctx.settings.highValueThreshold.toLocaleString()} — goes to the QC review queue.`);
  }
  if (!blockReason && subCategory.marketCeiling != null && result.price > subCategory.marketCeiling) {
    warnings.push(`Above the market ceiling of Rs ${subCategory.marketCeiling.toLocaleString()} for ${subCategory.name}.`);
  }

  return {
    sub_category: { id: subCategory.slug, code: subCategory.code, name: subCategory.name, measure_type: subCategory.measureType },
    landed_cost: round2(result.landedCost),
    price: blockReason ? null : result.price,
    premium_price: blockReason ? null : result.premiumPrice,
    grade_prices: blockReason ? null : result.gradePrices,
    markdowns: blockReason ? [] : result.markdowns,
    gp_pct: blockReason ? null : round4(result.gpPct),
    brand: { id: brand.id, name: brand.name, tier: brand.tier, matched: brand.matched },
    brand_tier: brand.tier,
    grade,
    adjustment,
    multiple: round4(result.multiple),
    settings_version: ctx.settingsVersion,
    pricing_source: ctx.source,
    ...(blockReason ? { block_reason: blockReason } : {}),
    ...(warnings.length ? { warnings } : {}),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
