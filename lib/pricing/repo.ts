/**
 * Database-backed pricing context.
 *
 * The engine is pure and takes settings and reference data as parameters;
 * this module is what supplies them from Supabase so that every change made
 * in the pricing sidebar is reflected in the next price. The code constants
 * remain the seed and the fallback.
 *
 * Server-only: uses the request-scoped Supabase client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  BRAND_TIERS,
  DEFAULT_BRAND_TIER,
  DEFAULT_SETTINGS,
  GRADES,
  PROFILES,
  SETTINGS_VERSION,
  type BrandTier,
  type Grade,
  type GradeCode,
  type Profile,
  type ProfileCode,
  type Settings,
} from "./constants";
import type { PricingRefs } from "./engine";
import { SUB_CATEGORIES, type MeasureType } from "./sub-categories";

export type DbSubCategory = {
  slug: string;
  code: string;
  categorySlug: string;
  name: string;
  weightKg: number;
  profileCode: ProfileCode;
  valueIndex: number;
  measureType: MeasureType;
  marketCeiling: number | null;
  perPieceCost: number | null;
  perPieceShare: number;
  active: boolean;
};

export type PricingContext = {
  settings: Settings;
  settingsVersion: number;
  refs: PricingRefs;
  subCategories: DbSubCategory[];
  /** "defaults" means the database could not be read and code constants were used */
  source: "database" | "defaults";
  warning?: string;
};

type SettingsRow = {
  version: number;
  fx: number | string;
  blended_rate: number | string;
  duty_per_kg: number | string;
  sorting_per_piece: number | string;
  input_tax_rate: number | string;
  input_tax_recover: number | string;
  sales_tax: number | string;
  target_gp: number | string;
  rejected_share: number | string;
  bulk_recovery: number | string;
  charm_step: number;
  charm_end: number;
  min_price: number;
  brand_feedback_enabled: boolean;
  high_value_threshold: number;
};

const num = (v: number | string | null | undefined, fallback = 0) => (v == null ? fallback : Number(v));

export function settingsFromRow(row: SettingsRow): Settings {
  return {
    fx: num(row.fx),
    blendedRate: num(row.blended_rate),
    dutyPerKg: num(row.duty_per_kg),
    sortingPerPiece: num(row.sorting_per_piece),
    inputTaxRate: num(row.input_tax_rate),
    inputTaxRecover: num(row.input_tax_recover),
    salesTax: num(row.sales_tax),
    targetGP: num(row.target_gp),
    rejectedShare: num(row.rejected_share),
    bulkRecovery: num(row.bulk_recovery),
    charmStep: num(row.charm_step),
    charmEnd: num(row.charm_end),
    minPrice: num(row.min_price),
    brandFeedbackEnabled: Boolean(row.brand_feedback_enabled),
    highValueThreshold: num(row.high_value_threshold),
  };
}

export function settingsToRow(s: Settings) {
  return {
    fx: s.fx,
    blended_rate: s.blendedRate,
    duty_per_kg: s.dutyPerKg,
    sorting_per_piece: s.sortingPerPiece,
    input_tax_rate: s.inputTaxRate,
    input_tax_recover: s.inputTaxRecover,
    sales_tax: s.salesTax,
    target_gp: s.targetGP,
    rejected_share: s.rejectedShare,
    bulk_recovery: s.bulkRecovery,
    charm_step: s.charmStep,
    charm_end: s.charmEnd,
    min_price: s.minPrice,
    brand_feedback_enabled: s.brandFeedbackEnabled,
    high_value_threshold: s.highValueThreshold,
  };
}

function defaultsContext(warning: string): PricingContext {
  return {
    settings: DEFAULT_SETTINGS,
    settingsVersion: SETTINGS_VERSION,
    refs: { grades: GRADES, profiles: PROFILES, brandTiers: BRAND_TIERS },
    subCategories: SUB_CATEGORIES.map((s) => ({
      slug: s.slug,
      code: s.code,
      categorySlug: s.categorySlug,
      name: s.name,
      weightKg: s.weightKg,
      profileCode: s.profileCode,
      valueIndex: s.valueIndex,
      measureType: s.measureType,
      marketCeiling: s.marketCeiling,
      perPieceCost: s.perPieceCost,
      perPieceShare: s.perPieceShare,
      active: s.active,
    })),
    source: "defaults",
    warning,
  };
}

/**
 * Load the current settings version, grades, profiles and sub-categories.
 * Falls back to the code constants — visibly, via `source` — if the
 * database cannot be read, so a pricing screen never silently goes blank.
 */
export async function loadPricingContext(supabase: SupabaseClient): Promise<PricingContext> {
  const [settingsRes, gradesRes, profilesRes, subsRes] = await Promise.all([
    supabase.from("settings").select("*").order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("grades").select("code, name, multiplier, share_of_intake, sort_order").order("sort_order"),
    supabase.from("profiles").select("code, name, pulled_share, vol_full, vol_promo, vol_md1, vol_md2, vol_md3"),
    supabase
      .from("sub_categories")
      .select("slug, code, category_slug, name, weight_kg, profile_code, value_index, measure_type, market_ceiling, per_piece_cost, per_piece_share, active"),
  ]);

  const firstError = settingsRes.error ?? gradesRes.error ?? profilesRes.error ?? subsRes.error;
  if (firstError || !settingsRes.data || !gradesRes.data?.length || !profilesRes.data?.length || !subsRes.data?.length) {
    return defaultsContext(
      `Pricing data could not be read from the database (${firstError?.message ?? "empty tables"}); using built-in defaults.`,
    );
  }

  const grades: Grade[] = gradesRes.data.map((g) => ({
    code: g.code as GradeCode,
    name: g.name,
    multiplier: num(g.multiplier),
    shareOfIntake: num(g.share_of_intake),
    sortOrder: g.sort_order,
  }));

  const profiles: Profile[] = profilesRes.data.map((p) => ({
    code: p.code as ProfileCode,
    name: p.name,
    pulledShare: num(p.pulled_share),
    volFull: num(p.vol_full),
    volPromo: num(p.vol_promo),
    volMd1: num(p.vol_md1),
    volMd2: num(p.vol_md2),
    volMd3: num(p.vol_md3),
  }));

  const subCategories: DbSubCategory[] = subsRes.data.map((s) => ({
    slug: s.slug,
    code: s.code,
    categorySlug: s.category_slug,
    name: s.name,
    weightKg: num(s.weight_kg),
    profileCode: s.profile_code as ProfileCode,
    valueIndex: num(s.value_index),
    measureType: s.measure_type as MeasureType,
    marketCeiling: s.market_ceiling == null ? null : num(s.market_ceiling),
    perPieceCost: s.per_piece_cost == null ? null : num(s.per_piece_cost),
    perPieceShare: num(s.per_piece_share),
    active: Boolean(s.active),
  }));

  return {
    settings: settingsFromRow(settingsRes.data as SettingsRow),
    settingsVersion: (settingsRes.data as SettingsRow).version,
    refs: { grades, profiles, brandTiers: BRAND_TIERS },
    subCategories,
    source: "database",
  };
}

export type BrandResolution = {
  id: number | null;
  name: string;
  tier: BrandTier;
  matched: boolean;
  warning?: string;
};

/** Resolve a typed brand to a tier from the brands table. Never judged by the tagger. */
export async function resolveBrandDb(supabase: SupabaseClient, input: string | null | undefined): Promise<BrandResolution> {
  const text = (input ?? "").trim();
  if (!text) {
    return { id: null, name: "", tier: DEFAULT_BRAND_TIER, matched: false, warning: "No brand given — priced as Regular high street." };
  }
  const { data } = await supabase.from("brands").select("id, name, tier").ilike("name", text).eq("active", true).limit(1).maybeSingle();
  if (data) return { id: data.id, name: data.name, tier: data.tier as BrandTier, matched: true };
  return {
    id: null,
    name: text,
    tier: DEFAULT_BRAND_TIER,
    matched: false,
    warning: `Unknown brand "${text}" — priced as Regular high street. Check the brand list.`,
  };
}
