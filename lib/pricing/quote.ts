/**
 * A price quote for one garment — the pure core of POST /api/price and the
 * pre-save check in POST /api/items. Takes an already-loaded context so it
 * can be unit tested with the code defaults and no database.
 *
 * With a lot, cost is the garment's scale weight times the lot's effective
 * rate (or the flat per-piece rate). Without one, it is a planning quote at
 * settings.blendedRate and the sub-category's default weight.
 */

import { REJECTED, type Adjustment, type GradeCode, type LotBasis } from "./constants";
import { computePrice, expectedRevenue } from "./engine";
import type { BrandResolution, DbLot, DbSubCategory, PricingContext } from "./repo";

export const GRADE_CODES: GradeCode[] = ["bnwt", "premium", "excellent", "very_good", "rejected"];
export const ADJUSTMENTS: Adjustment[] = ["below", "standard", "above"];

export type QuoteInput = {
  subCategory: DbSubCategory;
  brand: BrandResolution;
  grade: GradeCode;
  adjustment: Adjustment;
  isRare: boolean;
  /** Null for a planning quote */
  lot?: DbLot | null;
  /** Scale weight; required for kg lots, ignored for pc lots */
  weightKg?: number | null;
};

export type Quote = {
  sub_category: { id: string; code: string; name: string; measure_type: string };
  cost_basis: "lot" | "planning";
  lot: { id: number; code: string; basis: LotBasis; effective_rate: number; yield: number; status: string } | null;
  weight_kg: number | null;
  landed_cost: number;
  price: number | null;
  premium_price: number | null;
  grade_prices: Record<GradeCode, number> | null;
  markdowns: { stage: string; discount: number; price: number }[];
  gp_pct: number | null;
  expected_revenue: number | null;
  brand: { id: number | null; name: string; tier: string; matched: boolean };
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
  const { subCategory, brand, grade, adjustment, isRare, lot } = input;
  const warnings = [brand.warning, ctx.warning].filter((w): w is string => Boolean(w));

  // Cost inputs: the lot decides the basis and rate; the scale decides the weight.
  let basis: LotBasis = "kg";
  let effRate: number | undefined;
  let weightKg: number | null;
  if (lot) {
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
    weightKg = subCategory.weightKg;
    warnings.push("Planning quote at the blended rate and default weight — pick a lot and weigh the garment for the real price.");
  }

  const result = computePrice(
    {
      weightKg: weightKg ?? 0,
      basis,
      effectiveRate: effRate,
      imported: lot ? lot.imported : true,
      profileCode: subCategory.profileCode,
      valueIndex: subCategory.valueIndex,
      gradeCode: grade,
      tier: brand.tier,
      adjustment,
    },
    ctx.settings,
    ctx.refs,
  );

  const rejected = grade === REJECTED;
  // A rare piece is priced by hand even when the brand is priceable — two or
  // more special triggers send it to the Set Aside rail. Rare is a flag, not
  // a grade; a rejected rare piece is still rejected.
  const blockReason = rejected ? undefined : isRare ? "Rare piece — set aside and price by hand against resale listings." : result.blockReason;

  if (!blockReason && !rejected && result.price > ctx.settings.highValueThreshold) {
    warnings.push(`Above Rs ${ctx.settings.highValueThreshold.toLocaleString()} — goes to the QC review queue.`);
  }
  if (!blockReason && !rejected && subCategory.marketCeiling != null && result.price > subCategory.marketCeiling) {
    warnings.push(`Above the market ceiling of Rs ${subCategory.marketCeiling.toLocaleString()} for ${subCategory.name}.`);
  }

  const priced = !blockReason;
  return {
    sub_category: { id: subCategory.slug, code: subCategory.code, name: subCategory.name, measure_type: subCategory.measureType },
    cost_basis: lot ? "lot" : "planning",
    lot: lot ? lotSummary(lot) : null,
    weight_kg: weightKg,
    landed_cost: round2(result.landedCost),
    price: priced ? result.price : null,
    premium_price: priced ? result.premiumPrice : null,
    grade_prices: priced ? result.gradePrices : null,
    markdowns: priced ? result.markdowns : [],
    gp_pct: priced ? round4(result.gpPct) : null,
    expected_revenue: priced
      ? round2(expectedRevenue({ price: result.price, landedCost: result.landedCost, gradeCode: grade, profileCode: subCategory.profileCode }, ctx.settings, ctx.refs))
      : null,
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
    price: null,
    premium_price: null,
    grade_prices: null,
    markdowns: [],
    gp_pct: null,
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
