/**
 * Pricing constants — Part One, sections 1 and 2 of the build specification.
 *
 * These are the defaults that seed the `settings` table. Every price traces
 * back to them, so any change here reprices the whole catalogue: bump
 * SETTINGS_VERSION and stamp items with it, or a price cannot be explained
 * six months later.
 */

export const SETTINGS_VERSION = 1;

export type Settings = {
  /** PKR per USD */
  fx: number;
  /** USD/kg, averaged across all buying — a single input, not per lot */
  blendedRate: number;
  /** PKR per kg, charged on weight, so heavier garments carry more */
  dutyPerKg: number;
  /** Deliberately zero — sorting labour sits in overheads */
  sortingPerPiece: number;
  /** Sales tax paid at import */
  inputTaxRate: number;
  /** Share of input tax recoverable against output tax */
  inputTaxRecover: number;
  /** Shelf prices are tax inclusive */
  salesTax: number;
  /** Of ex-tax revenue */
  targetGP: number;
  /** Graded out at sorting */
  rejectedShare: number;
  /** What rejected and pulled stock fetches by weight */
  bulkRecovery: number;
  charmStep: number;
  charmEnd: number;
  minPrice: number;
  /** Off by default — see section 2.4 */
  brandFeedbackEnabled: boolean;
  /** PKR — items above this go to the QC review queue */
  highValueThreshold: number;
};

export const DEFAULT_SETTINGS: Settings = {
  fx: 283,
  blendedRate: 6.71,
  dutyPerKg: 44,
  sortingPerPiece: 0,
  inputTaxRate: 0.18,
  inputTaxRecover: 0.6,
  salesTax: 0.05,
  targetGP: 0.6,
  rejectedShare: 0.03,
  bulkRecovery: 0.04,
  charmStep: 100,
  charmEnd: 90,
  minPrice: 190,
  brandFeedbackEnabled: false,
  highValueThreshold: 4000,
};

/* ------------------------------------------------------------------ grades */

export type GradeCode = "bnwt" | "premium" | "excellent" | "very_good";

export type Grade = {
  code: GradeCode;
  name: string;
  multiplier: number;
  /** Assumed intake mix — section 9 open item 6 */
  shareOfIntake: number;
  sortOrder: number;
};

export const GRADES: readonly Grade[] = [
  { code: "bnwt", name: "Brand New with Tags", multiplier: 1.8, shareOfIntake: 0.02, sortOrder: 1 },
  { code: "premium", name: "Premium", multiplier: 1.0, shareOfIntake: 0.65, sortOrder: 2 },
  { code: "excellent", name: "Excellent", multiplier: 0.85, shareOfIntake: 0.2, sortOrder: 3 },
  { code: "very_good", name: "Very Good", multiplier: 0.6, shareOfIntake: 0.1, sortOrder: 4 },
];

export const BASE_GRADE: GradeCode = "premium";

export function grade(code: GradeCode): Grade {
  const found = GRADES.find((g) => g.code === code);
  if (!found) throw new Error(`Unknown grade: ${code}`);
  return found;
}

/* ---------------------------------------------------------------- profiles */

export type ProfileCode = "fast" | "standard" | "slow";

/**
 * Volume split across the ladder. Promo is retained at zero — seasonal
 * discounting is switched off.
 *
 * These splits are estimates and are the single largest source of error in
 * the model (section 2.2). Replace with real sell-through after one cycle.
 */
export type Profile = {
  code: ProfileCode;
  name: string;
  /** "Never sells" — pulled at month 5 and sold in bulk */
  pulledShare: number;
  volFull: number;
  volPromo: number;
  volMd1: number;
  volMd2: number;
  volMd3: number;
};

export const PROFILES: readonly Profile[] = [
  { code: "fast", name: "Fast", pulledShare: 0.02, volFull: 0.625, volPromo: 0, volMd1: 0.235, volMd2: 0.1, volMd3: 0.04 },
  { code: "standard", name: "Standard", pulledShare: 0.05, volFull: 0.425, volPromo: 0, volMd1: 0.295, volMd2: 0.18, volMd3: 0.1 },
  { code: "slow", name: "Slow", pulledShare: 0.08, volFull: 0.275, volPromo: 0, volMd1: 0.325, volMd2: 0.25, volMd3: 0.15 },
];

export function profile(code: ProfileCode): Profile {
  const found = PROFILES.find((p) => p.code === code);
  if (!found) throw new Error(`Unknown profile: ${code}`);
  return found;
}

/* ------------------------------------------------------------------ ladder */

export type LadderStage = "full" | "promo" | "md1" | "md2" | "md3";

/** Discount depth at each rung. Section 3. */
export const LADDER_DEPTHS: Readonly<Record<LadderStage, number>> = {
  full: 0,
  promo: 0,
  md1: 0.25,
  md2: 0.5,
  md3: 0.75,
};

/** Months on floor at each rung, in order. */
export const LADDER_MONTHS: Readonly<Record<LadderStage, number>> = {
  full: 1,
  promo: 0,
  md1: 1,
  md2: 1,
  md3: 1,
};

/* ------------------------------------------------------------- brand tiers */

export type BrandTier = "regular" | "affordable_luxury" | "ultra_luxury";

export type BrandTierInfo = {
  tier: BrandTier;
  name: string;
  /** Null for ultra luxury — priced by hand against resale listings */
  multiplier: number | null;
  share: number;
  automatic: boolean;
};

export const BRAND_TIERS: readonly BrandTierInfo[] = [
  { tier: "regular", name: "Regular high street", multiplier: 1.0, share: 0.95, automatic: true },
  { tier: "affordable_luxury", name: "Affordable luxury", multiplier: 2.0, share: 0.05, automatic: true },
  { tier: "ultra_luxury", name: "Ultra luxury", multiplier: null, share: 0, automatic: false },
];

export function brandTier(tier: BrandTier): BrandTierInfo {
  const found = BRAND_TIERS.find((b) => b.tier === tier);
  if (!found) throw new Error(`Unknown brand tier: ${tier}`);
  return found;
}

/** Unknown brands price as Regular, with a visible warning. */
export const DEFAULT_BRAND_TIER: BrandTier = "regular";

/* -------------------------------------------------------- item adjustment */

export type Adjustment = "below" | "standard" | "above";

/** Cap each of below/above at 15% of items — balance matters more than volume. */
export const ADJUSTMENT_MULTIPLIERS: Readonly<Record<Adjustment, number>> = {
  below: 0.85,
  standard: 1.0,
  above: 1.2,
};

export const ADJUSTMENT_CAP = 0.15;

/* --------------------------------------------------------- colour rotation */

export type ColourTag = "red" | "blue" | "green" | "yellow";

/** Four colours rotating monthly, so all four are live at once. Section 3.1. */
export const COLOUR_ROTATION: readonly ColourTag[] = ["red", "blue", "green", "yellow"];
