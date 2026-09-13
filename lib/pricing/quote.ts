/**
 * A price quote for one garment — the pure core of POST /api/price and the
 * pre-save check in POST /api/items. Takes an already-loaded context so it
 * can be unit tested with the code defaults and no database.
 *
 * With a lot, cost is the garment's scale weight times the lot's effective
 * rate (or the flat per-piece rate). Without one, it is a planning quote at
 * settings.blendedRate and the sub-category's default weight.
 */

import { REJECTED, type Adjustment, type CostBasis, type GradeCode } from "./constants";
import { computePrice, expectedRevenue } from "./engine";
import type { BrandResolution, DbLot, DbSubCategory, PricingContext } from "./repo";

export const GRADE_CODES: GradeCode[] = ["bnwt", "premium", "excellent", "very_good", "rejected"];
export const ADJUSTMENTS: Adjustment[] = ["below", "standard", "above"];

export type QuoteInput = {
  subCategory: DbSubCategory;
  brand: BrandResolution;
  grade: GradeCode;
  adjustment: Adjustment;
  /** 5% steps; overrides adjustment when given */
  adjustPct?: number;
  isRare: boolean;
  /** Null for a planning quote */
  lot?: DbLot | null;
  /** Scale weight; required for kg lots, ignored for pc lots */
  weightKg?: number | null;
  /** The tagger marked it Heavy: price from the sub-category's heavy cost when one is set */
  heavy?: boolean;
};

export type Quote = {
  sub_category: { id: string; code: string; name: string; measure_type: string };
  cost_basis: "standard" | "lot" | "planning";
  lot: { id: number; code: string; basis: CostBasis; effective_rate: number; yield: number; status: string } | null;
  weight_kg: number | null;
  landed_cost: number;
  /** Landed with every constant and profile loss spread onto it; premium ex tax = loaded / (1 - target GP). */
  loaded_cost: number;
  price: number | null;
  /** The pricing-sheet price at this grade with no adjustment */
  standard_price: number | null;
  adjust_pct: number;
  premium_price: number | null;
  grade_prices: Record<GradeCode, number> | null;
  markdowns: { stage: string; discount: number; price: number }[];
  /** This garment's margin after its own markdown ladder and never-sells share (expected revenue vs landed). */
  gp_pct: number | null;
  /** Margin per garment bought of this sub-category at its Premium price, after markdowns, grade mix, rejects and bulk recovery. */
  effective_gp_pct: number | null;
  expected_revenue: number | null;
  brand: { id: number | null; name: string; tier: string; matched: boolean; corrected_from?: string; is_new?: boolean };
  brand_tier: string;
  grade: GradeCode;
  adjustment: Adjustment;
  multiple: number;
  settings_version: number;
  pricing_source: PricingContext["source"];
  block_reason?: string;
  warnings?: string[];
  error?: string;
};

export function quote(input: QuoteInput, ctx: PricingContext): Quote {
  const { subCategory, brand, grade, adjustment, lot } = input;
  const warnings = [brand.warning, ctx.warning].filter((w): w is string => Boolean(w));

  // Cost inputs. The standard cost per garment wins — one shelf price for a
  // Nike sports shirt whichever vendor it came from. Lot weight pricing
  // remains for sub-categories with no standard cost yet.
  let basis: CostBasis = "kg";
  let effRate: number | undefined;
  let weightKg: number | null;
  if (subCategory.standardCost) {
    // The sheet's cost per piece is the purchase cost before sales tax; landed applies the constants.
    basis = "pc";
    effRate = input.heavy && subCategory.heavyCost ? subCategory.heavyCost : subCategory.standardCost;
    weightKg = null;
  } else if (lot) {
    if (lot.effectiveRate == null) {
      return { ...empty(subCategory, brand, grade, adjustment, ctx), lot: lotSummary(lot), error: `Lot ${lot.code} has no rate yet — set it before tagging from it.` };
    }
    basis = lot.basis;
    effRate = lot.effectiveRate;
    weightKg = basis === "pc" ? null : input.weightKg ?? null;
    if (basis === "kg" && !(weightKg && weightKg > 0)) {
      return { ...empty(subCategory, brand, grade, adjustment, ctx), lot: lotSummary(lot), error: "Weigh the garment — kg lots price by scale weight." };
    }
  } else {
    // Lots carry no cost here any more (they live in the commercial software), so a
    // sub-category without a cost per piece cannot be priced — say so, do not guess.
    return { ...empty(subCategory, brand, grade, adjustment, ctx), error: `No cost per piece is set for ${subCategory.name} — set it under Pricing → Categories before tagging.` };
  }

  const baseInputs = {
    weightKg: weightKg ?? 0,
    basis,
    effectiveRate: effRate,
    imported: basis === "pc" && subCategory.standardCost ? true : lot ? lot.imported : true,
    premiumOverride: subCategory.marketPrice,
    profileCode: subCategory.profileCode,
    valueIndex: subCategory.valueIndex,
    gradeCode: grade,
    tier: brand.tier,
  };
  const adjustPct = input.adjustPct ?? { below: -15, standard: 0, above: 20 }[adjustment];
  const result = computePrice({ ...baseInputs, adjustPct }, ctx.settings, ctx.refs);
  const standard = computePrice({ ...baseInputs, adjustPct: 0 }, ctx.settings, ctx.refs);

  const rejected = grade === REJECTED;
  // A rare piece is priced by hand even when the brand is priceable — two or
  // more special triggers send it to the Set Aside rail. Rare is a flag, not
  // a grade; a rejected rare piece is still rejected.
  // Rare is a flag and a note now, not a hand-off: the piece prices as normal
  // (or by hand at the senior's price). Only an ultra-luxury brand blocks.
  const blockReason = rejected ? undefined : result.blockReason;


  if (!blockReason && !rejected && subCategory.marketCeiling != null && result.price > subCategory.marketCeiling) {
    warnings.push(`Above the market ceiling of Rs ${subCategory.marketCeiling.toLocaleString()} for ${subCategory.name}.`);
  }

  const priced = !blockReason;
  const expected = priced ? expectedRevenue({ price: result.price, landedCost: result.landedCost, gradeCode: grade, profileCode: subCategory.profileCode }, ctx.settings, ctx.refs) : 0;
  return {
    sub_category: { id: subCategory.slug, code: subCategory.code, name: subCategory.name, measure_type: subCategory.measureType },
    cost_basis: subCategory.standardCost ? "standard" : lot ? "lot" : "planning",
    lot: lot ? lotSummary(lot) : null,
    weight_kg: weightKg,
    landed_cost: round2(result.landedCost),
    loaded_cost: round2(result.loadedCost),
    price: priced ? result.price : null,
    standard_price: priced ? standard.price : null,
    adjust_pct: adjustPct,
    premium_price: priced ? result.premiumPrice : null,
    grade_prices: priced ? result.gradePrices : null,
    markdowns: priced ? result.markdowns : [],
    gp_pct: priced && expected > 0 ? round4((expected - result.landedCost) / expected) : null,
    effective_gp_pct: priced ? round4(result.effectiveGpPct) : null,
    expected_revenue: priced ? round2(expected) : null,
    brand: { id: brand.id, name: brand.name, tier: brand.tier, matched: brand.matched, ...(brand.corrected_from ? { corrected_from: brand.corrected_from } : {}), ...(brand.is_new ? { is_new: true } : {}) },
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

function lotSummary(lot: DbLot) {
  return { id: lot.id, code: lot.code, basis: lot.basis, effective_rate: round4(lot.effectiveRate ?? 0), yield: round4(lot.yield), status: lot.status };
}

function empty(subCategory: DbSubCategory, brand: BrandResolution, grade: GradeCode, adjustment: Adjustment, ctx: PricingContext): Quote {
  return {
    sub_category: { id: subCategory.slug, code: subCategory.code, name: subCategory.name, measure_type: subCategory.measureType },
    cost_basis: "lot",
    lot: null,
    weight_kg: null,
    landed_cost: 0,
    loaded_cost: 0,
    price: null,
    standard_price: null,
    adjust_pct: 0,
    premium_price: null,
    grade_prices: null,
    markdowns: [],
    gp_pct: null,
    effective_gp_pct: null,
    expected_revenue: null,
    brand: { id: brand.id, name: brand.name, tier: brand.tier, matched: brand.matched },
    brand_tier: brand.tier,
    grade,
    adjustment,
    multiple: 0,
    settings_version: ctx.settingsVersion,
    pricing_source: ctx.source,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
