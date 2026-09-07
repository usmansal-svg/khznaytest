/**
 * The pricing chain — Part One, sections 1, 2 and 3 of the build specification.
 *
 * This module is the single source of pricing truth. It is pure: no Next.js,
 * no database, no I/O, so it can be unit tested directly and called from a
 * route handler. The tagging form must never recompute a price client-side —
 * if it does, the browser and the server will disagree the first time
 * settings change.
 *
 * The chain has many multiplicative terms and a single misplaced one is
 * invisible until margin has already leaked, so engine.test.ts pins the
 * section 8 verification table. Keep it.
 */

import {
  ADJUSTMENT_MULTIPLIERS,
  BASE_GRADE,
  BRAND_TIERS,
  COLOUR_ROTATION,
  DEFAULT_SETTINGS,
  GRADES,
  LADDER_DEPTHS,
  brandTier,
  grade,
  profile,
  type Adjustment,
  type BrandTier,
  type ColourTag,
  type GradeCode,
  type LadderStage,
  type ProfileCode,
  type Settings,
} from "./constants";

/* ------------------------------------------------------------------- cost */

export type CostInputs = {
  weightKg: number;
  /** Share of this sub-category bought per piece rather than per kg */
  perPieceShare?: number;
  /** PKR per garment when bought by the piece */
  perPieceCost?: number;
};

/**
 * landedCost = ((1 - ppShare) * (weight * blendedRate * fx + weight * dutyPerKg)
 *               + ppShare * perPieceCost)
 *              * (1 - inputTaxRate * inputTaxRecover)
 *              + sortingPerPiece
 *
 * Freight is already inside blendedRate. Recoverable input tax reduces cost
 * by 10.8%. Import duty is added here; output sales tax is added later, in
 * the multiple.
 */
export function landedCost(inputs: CostInputs, settings: Settings = DEFAULT_SETTINGS): number {
  const ppShare = inputs.perPieceShare ?? 0;
  const perPieceCost = inputs.perPieceCost ?? 0;

  const byWeight = inputs.weightKg * settings.blendedRate * settings.fx + inputs.weightKg * settings.dutyPerKg;
  const byPiece = perPieceCost;

  const blended = (1 - ppShare) * byWeight + ppShare * byPiece;
  const taxCredit = 1 - settings.inputTaxRate * settings.inputTaxRecover;

  return blended * taxCredit + settings.sortingPerPiece;
}

/* --------------------------------------------------------------- multiple */

/**
 * The grade-mix term: SUM(gradeShare[g] / sellable * gradeMult[g]).
 *
 * Shares are of total intake, so they are divided by the sellable share to
 * become shares of what actually reaches the floor.
 */
export function gradeSum(settings: Settings = DEFAULT_SETTINGS): number {
  const sellable = 1 - settings.rejectedShare;
  return GRADES.reduce((sum, g) => sum + (g.shareOfIntake / sellable) * g.multiplier, 0);
}

/** The blended brand uplift, SUM(share * multiplier) = 1.05 at current tiers. */
export function blendedBrandUplift(): number {
  return BRAND_TIERS.reduce((sum, t) => sum + t.share * (t.multiplier ?? 0), 0);
}

/** Blended discount depth, D = SUM(depth[i] * volume[i]). */
export function blendedDiscount(profileCode: ProfileCode): number {
  const p = profile(profileCode);
  const volumes: Record<LadderStage, number> = {
    full: p.volFull,
    promo: p.volPromo,
    md1: p.volMd1,
    md2: p.volMd2,
    md3: p.volMd3,
  };
  return (Object.keys(volumes) as LadderStage[]).reduce(
    (sum, stage) => sum + LADDER_DEPTHS[stage] * volumes[stage],
    0,
  );
}

/**
 * multiple = ( 1/(1-targetGP) - (pulled + rejected) * bulkRecovery )
 *            / ( (1 - D) * gsum * fullShare )
 *            * (1 + salesTax)
 *
 * Yields 3.3947 / 3.9640 / 4.5766 for fast / standard / slow at the
 * current settings.
 */
export function profileMultiple(profileCode: ProfileCode, settings: Settings = DEFAULT_SETTINGS): number {
  const p = profile(profileCode);

  const gsum = gradeSum(settings);
  const fullShare = 1 - settings.rejectedShare - p.pulledShare;
  const d = blendedDiscount(profileCode);

  const revenueTarget = 1 / (1 - settings.targetGP);
  const bulkCredit = (p.pulledShare + settings.rejectedShare) * settings.bulkRecovery;

  let multiple = ((revenueTarget - bulkCredit) / ((1 - d) * gsum * fullShare)) * (1 + settings.salesTax);

  // With the feedback toggle on, regular prices divide by the blended brand
  // uplift so the whole book hits target together and everyday prices fall
  // about 5%. Off by default, which leaves luxury as pure upside.
  if (settings.brandFeedbackEnabled) {
    multiple /= blendedBrandUplift();
  }

  return multiple;
}

/* --------------------------------------------------------------- rounding */

/**
 * charm(x) = MAX(minPrice, ROUND((x - charmEnd) / step) * step + charmEnd)
 *
 * Every price at every grade and every markdown ends in 90. Nearest, not up
 * or down: 1230 -> 1190, 1260 -> 1290.
 */
export function charm(value: number, settings: Settings = DEFAULT_SETTINGS): number {
  const rounded = Math.round((value - settings.charmEnd) / settings.charmStep) * settings.charmStep + settings.charmEnd;
  return Math.max(settings.minPrice, rounded);
}

/**
 * Charm rounding that never rounds a discount upward.
 *
 * SPEC DISCREPANCY (section 2.6 vs the section 8 worked example) — flagged,
 * not silently resolved:
 *
 *   Section 2.6 defines a single charm() using ROUND, and section 3 says
 *   markdowns are "computed from the rounded full price and re-rounded".
 *   Applying ROUND to the worked example's markdowns gives 1390 / 890 / 490,
 *   but the spec states 1290 / 890 / 390. Those three figures are all and
 *   only reproducible with FLOOR.
 *
 *   The grade prices need the opposite: Very Good is 1090 in both the worked
 *   example and the section 8 table, which ROUND produces and FLOOR does not
 *   (it gives 990). So grades round and markdowns floor.
 *
 *   Flooring markdowns is also the commercially safe reading: it guarantees
 *   the customer never gets less than the advertised discount. Rounding 25%
 *   off up to 1390 would be a 22.3% discount on a "25% OFF" sticker.
 *
 * Confirm with the founder before this ships. If the intent really is ROUND
 * everywhere, swap this for charm() and update the ladder expectations in
 * engine.test.ts.
 */
export function charmDown(value: number, settings: Settings = DEFAULT_SETTINGS): number {
  const floored = Math.floor((value - settings.charmEnd) / settings.charmStep) * settings.charmStep + settings.charmEnd;
  return Math.max(settings.minPrice, floored);
}

/* ------------------------------------------------------------------ price */

export type PriceInputs = {
  weightKg: number;
  profileCode: ProfileCode;
  valueIndex: number;
  gradeCode?: GradeCode;
  tier?: BrandTier;
  adjustment?: Adjustment;
  perPieceShare?: number;
  perPieceCost?: number;
};

export type PriceResult = {
  landedCost: number;
  /** The rounded Premium price. Every other grade derives from this. */
  premiumPrice: number;
  /** Price at the requested grade */
  price: number;
  gradeCode: GradeCode;
  tier: BrandTier;
  adjustment: Adjustment;
  multiple: number;
  /** Price at each grade, all derived from the rounded premium price */
  gradePrices: Record<GradeCode, number>;
  markdowns: { stage: LadderStage; discount: number; price: number }[];
  /** Gross profit on this piece, against ex-tax revenue */
  gpPct: number;
  /** Set when the piece cannot be priced automatically */
  blockReason?: string;
};

/**
 * premiumPrice = charm(landedCost * profileMultiple * valueIndex
 *                      * brandMultiplier * adjustmentMultiplier)
 *
 * gradePrice = charm(premiumPrice * gradeMult[grade] / gradeMult["Premium"])
 *
 * Other grades derive from the *rounded* Premium price, not the raw figure.
 */
export function computePrice(inputs: PriceInputs, settings: Settings = DEFAULT_SETTINGS): PriceResult {
  const gradeCode = inputs.gradeCode ?? BASE_GRADE;
  const tier = inputs.tier ?? "regular";
  const adjustment = inputs.adjustment ?? "standard";

  const cost = landedCost(
    { weightKg: inputs.weightKg, perPieceShare: inputs.perPieceShare, perPieceCost: inputs.perPieceCost },
    settings,
  );
  const multiple = profileMultiple(inputs.profileCode, settings);
  const tierInfo = brandTier(tier);
  const adjustmentMultiplier = ADJUSTMENT_MULTIPLIERS[adjustment];

  // Ultra luxury blocks automatic pricing: set aside, authenticate, and price
  // against actual resale listings.
  const blockReason =
    tierInfo.multiplier === null
      ? "Ultra luxury — set aside, authenticate, and price manually against resale listings."
      : undefined;

  const brandMultiplier = tierInfo.multiplier ?? 1;

  const premiumPrice = charm(cost * multiple * inputs.valueIndex * brandMultiplier * adjustmentMultiplier, settings);

  const baseMultiplier = grade(BASE_GRADE).multiplier;
  const gradePrices = Object.fromEntries(
    GRADES.map((g) => [g.code, charm((premiumPrice * g.multiplier) / baseMultiplier, settings)]),
  ) as Record<GradeCode, number>;

  const price = gradePrices[gradeCode];

  return {
    landedCost: cost,
    premiumPrice,
    price,
    gradeCode,
    tier,
    adjustment,
    multiple,
    gradePrices,
    markdowns: markdownLadder(price, settings),
    gpPct: grossProfitPct(price, cost, settings),
    ...(blockReason ? { blockReason } : {}),
  };
}

/**
 * Markdown prices are computed from the rounded full price and re-rounded
 * downward — see charmDown for why the ladder floors where grades round.
 * The ladder is the only discounting — there are no seasonal promotions.
 */
export function markdownLadder(
  fullPrice: number,
  settings: Settings = DEFAULT_SETTINGS,
): { stage: LadderStage; discount: number; price: number }[] {
  return (["md1", "md2", "md3"] as LadderStage[]).map((stage) => ({
    stage,
    discount: LADDER_DEPTHS[stage],
    price: charmDown(fullPrice * (1 - LADDER_DEPTHS[stage]), settings),
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
