/**
 * The pricing chain — Khazanay tagging spec v2 (2026-09-09), sections 2–5,
 * with the multiple from section 4.2.
 *
 * This module is the single source of pricing truth. It is pure: no Next.js,
 * no database, no I/O, so it can be unit tested directly and called from a
 * route handler. The tagging form must never recompute a price client-side —
 * if it does, the browser and the server will disagree the first time
 * settings change.
 *
 * Everything that can be edited in the admin sidebar arrives as a parameter:
 * `settings` and `refs` (grades, profiles, brand tiers). The code constants
 * are only the defaults and the seed.
 *
 * engine.test.ts pins the section 9 verification table. Keep it.
 */

import {
  ADJUSTMENT_MULTIPLIERS,
  BASE_GRADE,
  BRAND_TIERS,
  COLOUR_ROTATION,
  DEFAULT_SETTINGS,
  GRADES,
  depthsOf,
  PROFILES,
  REJECTED,
  sellableGrades,
  type Adjustment,
  type BrandTier,
  type BrandTierInfo,
  type ColourTag,
  type Grade,
  type GradeCode,
  type LadderStage,
  type CostBasis,
  type LotCost,
  type Profile,
  type ProfileCode,
  type Settings,
} from "./constants";

/* ------------------------------------------------------------- references */

export type PricingRefs = {
  grades: readonly Grade[];
  profiles: readonly Profile[];
  brandTiers: readonly BrandTierInfo[];
};

export const DEFAULT_REFS: PricingRefs = {
  grades: GRADES,
  profiles: PROFILES,
  brandTiers: BRAND_TIERS,
};

function findGrade(refs: PricingRefs, code: GradeCode): Grade {
  const g = refs.grades.find((x) => x.code === code);
  if (!g) throw new Error(`Unknown grade: ${code}`);
  return g;
}

function findProfile(refs: PricingRefs, code: ProfileCode): Profile {
  const p = refs.profiles.find((x) => x.code === code);
  if (!p) throw new Error(`Unknown profile: ${code}`);
  return p;
}

function findTier(refs: PricingRefs, tier: BrandTier): BrandTierInfo {
  const t = refs.brandTiers.find((x) => x.tier === tier);
  if (!t) throw new Error(`Unknown brand tier: ${tier}`);
  return t;
}

/* ------------------------------------------------------------------- lots */

/**
 * Yield = kg_tagged / kg_bought: what was paid for that never reached a tag.
 * While the lot is open the provisional estimate stands in, so pricing
 * starts on day one. A five-point yield error moves a price by one rounding
 * step — less than a 20 g weighing difference — which is why tagging never
 * waits for the true-up.
 */
export function lotYield(lot: LotCost, settings: Settings = DEFAULT_SETTINGS): number {
  if (lot.kgTagged != null && lot.kgBought) return lot.kgTagged / lot.kgBought;
  return lot.provisionalYield ?? settings.defaultProvisionalYield;
}

/**
 * effective_rate = basis == 'pc' ? rate : rate / yield
 *
 * The vendor's rate is per kg bought; the garment pays per kg that reached a
 * tag. When a lot closes the rate corrects, but garments already tagged keep
 * their price — the difference lands in reported margin, never in repricing.
 */
export function effectiveRate(lot: LotCost, settings: Settings = DEFAULT_SETTINGS): number {
  if (lot.basis === "pc") return lot.rate;
  return lot.rate / lotYield(lot, settings);
}

/* ------------------------------------------------------------------- cost */

export type CostInputs = {
  /** Scale weight of this garment. Ignored for pc lots. */
  weightKg: number;
  /** kg | pc | standard (a landed cost per garment, as-is). Defaults to kg */
  basis?: CostBasis;
  /**
   * The lot's effective rate: USD/kg for kg lots, PKR per piece for pc
   * lots. Defaults to settings.blendedRate — a planning quote with no lot.
   */
  effectiveRate?: number;
  /** False for local purchases: no duty, no input-tax credit. Default true. */
  imported?: boolean;
};

/**
 * gross  = basis == 'pc' ? rate : weight * effective_rate * fx + weight * duty_per_kg
 * landed = gross * (1 - input_tax_rate * input_tax_recover) + sorting_per_piece
 *
 * Freight is already inside the vendor rate. Duty is added, recoverable
 * input tax subtracted. Output sales tax is added later, in the multiple.
 */
export function grossCost(inputs: CostInputs, settings: Settings = DEFAULT_SETTINGS): number {
  const basis = inputs.basis ?? "kg";
  const rate = inputs.effectiveRate ?? settings.blendedRate;
  const imported = inputs.imported ?? true;
  if (basis === "pc" || basis === "standard") return rate;
  // A local kg purchase is quoted in USD-equivalent terms too, but pays no duty.
  return inputs.weightKg * rate * settings.fx + (imported ? inputs.weightKg * settings.dutyPerKg : 0);
}

export function landedCost(inputs: CostInputs, settings: Settings = DEFAULT_SETTINGS): number {
  // A standard cost is already landed: no duty, no tax credit, no sorting.
  if (inputs.basis === "standard") return inputs.effectiveRate ?? 0;
  const imported = inputs.imported ?? true;
  const taxCredit = imported ? 1 - settings.inputTaxRate * settings.inputTaxRecover : 1;
  return grossCost(inputs, settings) * taxCredit + settings.sortingPerPiece;
}

/* --------------------------------------------------------------- multiple */

/**
 * The grade-mix term: SUM(grade_share[g] / sellable * grade_multiplier[g])
 * over the grades that reach the floor. Shares are of total intake, so they
 * are divided by the sellable share.
 */
export function gradeSum(settings: Settings = DEFAULT_SETTINGS, refs: PricingRefs = DEFAULT_REFS): number {
  const sellable = 1 - settings.rejectedShare;
  return sellableGrades(refs.grades).reduce((sum, g) => sum + (g.shareOfIntake / sellable) * g.multiplier, 0);
}

/** The blended brand uplift, SUM(share * multiplier) = 1.05 at current tiers. */
export function blendedBrandUplift(refs: PricingRefs = DEFAULT_REFS): number {
  return refs.brandTiers.reduce((sum, t) => sum + t.share * (t.multiplier ?? 0), 0);
}

/** Blended discount depth, D = SUM(ladder_depth[i] * profile.volume[i]). */
export function blendedDiscount(profileCode: ProfileCode, refs: PricingRefs = DEFAULT_REFS, settings: Settings = DEFAULT_SETTINGS): number {
  const p = findProfile(refs, profileCode);
  const depths = depthsOf(settings);
  const volumes: Record<LadderStage, number> = { full: p.volFull, promo: p.volPromo, md1: p.volMd1, md2: p.volMd2, md3: p.volMd3 };
  return (Object.keys(volumes) as LadderStage[]).reduce((sum, stage) => sum + depths[stage] * volumes[stage], 0);
}

/**
 * multiple = ( 1/(1 - target_gp) - (profile.pulled + rejected) * bulk_recovery )
 *            / ( (1 - D) * gsum * full_share )
 *            * (1 + sales_tax)
 *
 * 3.394729 / 3.964005 / 4.576611 for fast / standard / slow at the current
 * settings. Precomputed per profile; recompute only if the settings change.
 */
export function profileMultiple(profileCode: ProfileCode, settings: Settings = DEFAULT_SETTINGS, refs: PricingRefs = DEFAULT_REFS): number {
  const p = findProfile(refs, profileCode);
  const gsum = gradeSum(settings, refs);
  const fullShare = 1 - settings.rejectedShare - p.pulledShare;
  const d = blendedDiscount(profileCode, refs, settings);

  const revenueTarget = 1 / (1 - settings.targetGP);
  const bulkCredit = (p.pulledShare + settings.rejectedShare) * settings.bulkRecovery;

  let multiple = ((revenueTarget - bulkCredit) / ((1 - d) * gsum * fullShare)) * (1 + settings.salesTax);

  // Optional: divide regular prices by the blended brand uplift so the whole
  // book hits target together. Not in spec v2; off by default and retained
  // only because the settings row carries it.
  if (settings.brandFeedbackEnabled) multiple /= blendedBrandUplift(refs);

  return multiple;
}

/* --------------------------------------------------------------- rounding */

/**
 * charm(x) = MAX( min_price, ROUND((x - charm_end) / step) * step + charm_end )
 *
 * Nearest, not up or down: 1230 -> 1190, 1260 -> 1290. Every price at every
 * grade and every markdown ends in 90.
 */
export function charm(value: number, settings: Settings = DEFAULT_SETTINGS): number {
  const rounded = Math.round((value - settings.charmEnd) / settings.charmStep) * settings.charmStep + settings.charmEnd;
  return Math.max(settings.minPrice, rounded);
}

/* ------------------------------------------------------------------ price */

export type PriceInputs = CostInputs & {
  profileCode: ProfileCode;
  valueIndex: number;
  gradeCode?: GradeCode;
  tier?: BrandTier;
  adjustment?: Adjustment;
  /** Per-item adjustment in 5% steps (+5, -10, …). Overrides `adjustment` when given. */
  adjustPct?: number;
};

export type PriceResult = {
  landedCost: number;
  /** The rounded Premium price. Every other grade derives from this. */
  premiumPrice: number;
  /** Price at the requested grade; 0 for Rejected */
  price: number;
  gradeCode: GradeCode;
  tier: BrandTier;
  adjustment: Adjustment;
  multiple: number;
  /** Price at each grade, all derived from the rounded premium price */
  gradePrices: Record<GradeCode, number>;
  markdowns: { stage: LadderStage; discount: number; price: number }[];
  /** Gross profit on this piece, against ex-tax revenue; 0 for Rejected */
  gpPct: number;
  /** Set when the piece cannot be priced automatically */
  blockReason?: string;
};

/**
 * premium = charm( landed * profile.multiple * value_index * brand * adjustment )
 * price   = grade == 'Premium' ? premium : charm( premium * grade_multiplier[grade] )
 * price   = 0 when grade == 'Rejected'
 *
 * Other grades derive from the *rounded* Premium price, not the raw figure.
 */
export function computePrice(inputs: PriceInputs, settings: Settings = DEFAULT_SETTINGS, refs: PricingRefs = DEFAULT_REFS): PriceResult {
  const gradeCode = inputs.gradeCode ?? BASE_GRADE;
  const tier = inputs.tier ?? "regular";
  const adjustment = inputs.adjustment ?? "standard";

  const cost = landedCost(inputs, settings);
  const multiple = profileMultiple(inputs.profileCode, settings, refs);
  const tierInfo = findTier(refs, tier);

  // Ultra luxury blocks automatic pricing: set aside, authenticate, and price
  // against actual resale listings.
  const blockReason =
    tierInfo.multiplier === null ? "Ultra luxury — set aside, authenticate, and price manually against resale listings." : undefined;

  const brandMultiplier = tierInfo.multiplier ?? 1;
  const adjustmentMultiplier = inputs.adjustPct != null ? 1 + inputs.adjustPct / 100 : ADJUSTMENT_MULTIPLIERS[adjustment];
  const premiumPrice = charm(cost * multiple * inputs.valueIndex * brandMultiplier * adjustmentMultiplier, settings);

  const baseMultiplier = findGrade(refs, BASE_GRADE).multiplier;
  const gradePrices = Object.fromEntries(
    refs.grades.map((g) => [g.code, g.multiplier > 0 ? charm((premiumPrice * g.multiplier) / baseMultiplier, settings) : 0]),
  ) as Record<GradeCode, number>;

  const rejected = gradeCode === REJECTED;
  const price = rejected ? 0 : gradePrices[gradeCode];

  return {
    landedCost: cost,
    premiumPrice,
    price,
    gradeCode,
    tier,
    adjustment,
    multiple,
    gradePrices,
    markdowns: rejected ? [] : markdownLadder(price, settings),
    gpPct: rejected ? 0 : grossProfitPct(price, cost, settings),
    ...(blockReason ? { blockReason } : {}),
  };
}

/**
 * Markdown prices are computed from the rounded full price and re-rounded.
 * The ladder is the only discounting — there are no seasonal promotions.
 */
export function markdownLadder(fullPrice: number, settings: Settings = DEFAULT_SETTINGS): { stage: LadderStage; discount: number; price: number }[] {
  const depths = depthsOf(settings);
  return (["md1", "md2", "md3"] as LadderStage[]).map((stage) => ({
    stage,
    discount: depths[stage],
    price: charm(fullPrice * (1 - depths[stage]), settings),
  }));
}

/**
 * Gross profit on one piece, against ex-tax revenue — shelf prices are tax
 * inclusive, so the tax comes out before the margin is taken.
 */
export function grossProfitPct(price: number, cost: number, settings: Settings = DEFAULT_SETTINGS): number {
  const exTax = price / (1 + settings.salesTax);
  if (exTax === 0) return 0;
  return (exTax - cost) / exTax;
}

/* ------------------------------------------------------- expected revenue */

/**
 * Expected revenue per item until real sales exist (spec v2, section 7):
 *
 *   rejected: landed * bulk_recovery
 *   else:     price * sells_share * (1 - blended_discount) / (1 + sales_tax)
 *             + landed * profile.pulled * bulk_recovery
 *
 * Ex-tax, so it compares directly with landed cost for lot P&L.
 */
export function expectedRevenue(
  item: { price: number; landedCost: number; gradeCode: GradeCode; profileCode: ProfileCode },
  settings: Settings = DEFAULT_SETTINGS,
  refs: PricingRefs = DEFAULT_REFS,
): number {
  if (item.gradeCode === REJECTED) return item.landedCost * settings.bulkRecovery;
  const p = findProfile(refs, item.profileCode);
  const sellsShare = 1 - p.pulledShare;
  const d = blendedDiscount(item.profileCode, refs, settings);
  return (item.price * sellsShare * (1 - d)) / (1 + settings.salesTax) + item.landedCost * p.pulledShare * settings.bulkRecovery;
}

/* ---------------------------------------------------------- colour rotation */

/**
 * Colour is assigned by the month an item is floored, never by when the bale
 * arrived. Four colours rotate, so each maps to exactly one discount and the
 * fifth month back reuses today's colour.
 */
export function colourForMonth(date: Date): ColourTag {
  const monthsSinceEpoch = date.getFullYear() * 12 + date.getMonth();
  return COLOUR_ROTATION[((monthsSinceEpoch % 4) + 4) % 4];
}

/** How many colours back a cohort is: 0 = full price, 4 = due to be pulled. */
export function coloursBack(flooredOn: Date, asOf: Date): number {
  const floored = flooredOn.getFullYear() * 12 + flooredOn.getMonth();
  const now = asOf.getFullYear() * 12 + asOf.getMonth();
  return Math.max(0, now - floored);
}

/** The ladder stage a floored item is at today, or "pull" once four back. */
export function stageFor(flooredOn: Date, asOf: Date): LadderStage | "pull" {
  const back = coloursBack(flooredOn, asOf);
  const stages: (LadderStage | "pull")[] = ["full", "md1", "md2", "md3"];
  return back >= stages.length ? "pull" : stages[back];
}
