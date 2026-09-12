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
  type LotBasis,
  type LotCost,
  type Profile,
  type ProfileCode,
  type Settings,
  OUTLET_GRADES,
  type OutletGrade,
} from "./constants";
import { effectiveRate, lotYield, type PricingRefs } from "./engine";
import { matchBrand, normaliseBrand } from "@/lib/brands/normalise";
import { SUB_CATEGORIES, type MeasureType } from "./sub-categories";

export type DbSubCategory = {
  slug: string;
  code: string;
  categorySlug: string;
  gender: string;
  name: string;
  weightKg: number;
  profileCode: ProfileCode;
  valueIndex: number;
  measureType: MeasureType;
  /** summer | winter | all — which season's catalogue this belongs to */
  season: "summer" | "winter" | "all";
  marketCeiling: number | null;
  perPieceCost: number | null;
  perPieceShare: number;
  /** Landed cost per garment used for pricing — the same for every vendor */
  standardCost: number | null;
  /** Cost per piece for the heavy version, when the tagger marks a garment Heavy */
  heavyCost: number | null;
  /** The sheet's "new in store" price for the sub-category, if set */
  marketPrice: number | null;
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
  default_provisional_yield?: number | string | null;
  ladder_depths?: (number | string)[] | null;
  default_daily_target?: number | null;
  qc_sample_rate?: number | string | null;
  outlet_min_grade?: string | null;
  compare_factor_regular?: number | string | null;
  compare_factor_affordable?: number | string | null;
  compare_formula_enabled?: boolean | null;
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
    defaultProvisionalYield: num(row.default_provisional_yield, DEFAULT_SETTINGS.defaultProvisionalYield),
    ladderDepths: depthsFromRow(row.ladder_depths),
    defaultDailyTarget: num(row.default_daily_target, DEFAULT_SETTINGS.defaultDailyTarget),
    qcSampleRate: num(row.qc_sample_rate, DEFAULT_SETTINGS.qcSampleRate),
    outletMinGrade: (OUTLET_GRADES as string[]).includes(row.outlet_min_grade ?? "") ? (row.outlet_min_grade as OutletGrade) : DEFAULT_SETTINGS.outletMinGrade,
    compareFactorRegular: num(row.compare_factor_regular, DEFAULT_SETTINGS.compareFactorRegular),
    compareFactorAffordable: num(row.compare_factor_affordable, DEFAULT_SETTINGS.compareFactorAffordable),
    compareFormulaEnabled: row.compare_formula_enabled ?? DEFAULT_SETTINGS.compareFormulaEnabled,
  };
}

/** Stored as [0, md1, md2, md3] (full price first); tolerate a bare triple. */
function depthsFromRow(arr: (number | string)[] | null | undefined): [number, number, number] {
  const n = (arr ?? []).map(Number).filter((x) => Number.isFinite(x));
  const tail = n.length >= 4 ? n.slice(-3) : n.length === 3 ? n : null;
  if (!tail || tail.some((x) => !(x > 0 && x < 1))) return DEFAULT_SETTINGS.ladderDepths;
  return [tail[0], tail[1], tail[2]];
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
    default_provisional_yield: s.defaultProvisionalYield,
    ladder_depths: [0, ...s.ladderDepths],
    ladder_months: [1, 1, 1, 1],
    default_daily_target: s.defaultDailyTarget,
    qc_sample_rate: s.qcSampleRate,
    outlet_min_grade: s.outletMinGrade,
    compare_factor_regular: s.compareFactorRegular,
    compare_factor_affordable: s.compareFactorAffordable,
    compare_formula_enabled: s.compareFormulaEnabled,
  };
}

/** A gateway timeout arrives as a whole HTML page; keep the warning readable. */
function brief(message: string): string {
  const text = message.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const hit = /connection timed out|timed out|timeout|unavailable|bad gateway/i.exec(text);
  const core = hit ? hit[0].toLowerCase() : text;
  return core.length > 80 ? core.slice(0, 77) + "…" : core;
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
      gender: /women/.test(s.categorySlug) ? "women" : /children/.test(s.categorySlug) ? "kid" : /men/.test(s.categorySlug) ? "men" : "women",
      name: s.name,
      weightKg: s.weightKg,
      profileCode: s.profileCode,
      valueIndex: s.valueIndex,
      measureType: s.measureType,
      season: "all",
      marketCeiling: s.marketCeiling,
      perPieceCost: s.perPieceCost,
      perPieceShare: s.perPieceShare,
      standardCost: null,
      heavyCost: null,
      marketPrice: null,
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
let lastGood: { ctx: PricingContext; at: number } | null = null;

export async function loadPricingContext(supabase: SupabaseClient): Promise<PricingContext> {
  // A gateway blip should not reprice the floor: try again once, then serve
  // the last pricing this server loaded, and only with nothing at all fall
  // back to the code constants (visibly).
  const first = await readPricingContext(supabase);
  if (!("failed" in first)) { lastGood = { ctx: first, at: Date.now() }; return first; }
  await new Promise((r) => setTimeout(r, 400));
  const second = await readPricingContext(supabase);
  if (!("failed" in second)) { lastGood = { ctx: second, at: Date.now() }; return second; }
  if (lastGood) {
    const mins = Math.round((Date.now() - lastGood.at) / 60000);
    return { ...lastGood.ctx, warning: `The database did not answer (${brief(second.failed)}); prices use the pricing loaded ${mins < 1 ? "moments" : `${mins} min`} ago. Reload in a minute.` };
  }
  return defaultsContext(
    `Pricing data could not be read from the database (${brief(second.failed)}); using built-in defaults — tags cannot be saved until it answers. Reload in a minute.`,
  );
}

async function readPricingContext(supabase: SupabaseClient): Promise<PricingContext | { failed: string }> {
  const [settingsRes, gradesRes, profilesRes, subsRes] = await Promise.all([
    supabase.from("settings").select("*").order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("grades").select("code, name, multiplier, share_of_intake, sort_order").order("sort_order"),
    supabase.from("profiles").select("code, name, pulled_share, vol_full, vol_promo, vol_md1, vol_md2, vol_md3"),
    supabase
      .from("sub_categories")
      .select("slug, code, category_slug, gender, name, weight_kg, profile_code, value_index, measure_type, season, market_ceiling, market_price, per_piece_cost, per_piece_share, standard_cost_pkr, heavy_cost_pkr, active"),
  ]);

  const firstError = settingsRes.error ?? gradesRes.error ?? profilesRes.error ?? subsRes.error;
  if (firstError || !settingsRes.data || !gradesRes.data?.length || !profilesRes.data?.length || !subsRes.data?.length) {
    return { failed: firstError?.message ?? "empty tables" };
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
    gender: s.gender ?? "men",
    name: s.name,
    weightKg: num(s.weight_kg),
    profileCode: s.profile_code as ProfileCode,
    valueIndex: num(s.value_index),
    measureType: s.measure_type as MeasureType,
    season: (s.season === "summer" || s.season === "winter" ? s.season : "all") as "summer" | "winter" | "all",
    marketCeiling: s.market_ceiling == null ? null : num(s.market_ceiling),
    perPieceCost: s.per_piece_cost == null ? null : num(s.per_piece_cost),
    perPieceShare: num(s.per_piece_share),
    standardCost: s.standard_cost_pkr == null ? null : num(s.standard_cost_pkr),
    heavyCost: s.heavy_cost_pkr == null ? null : num(s.heavy_cost_pkr),
    marketPrice: s.market_price == null ? null : num(s.market_price),
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
  /** What the tagger typed, when it differs from the name used */
  corrected_from?: string;
  /** True when no listed brand is close — saving will add it */
  is_new?: boolean;
  warning?: string;
};

/**
 * Resolve a typed brand to a tier from the brands table. Never judged by
 * the tagger. Exact or near matches (small misspellings) snap to the listed
 * brand; anything else is cleaned up as a new Regular brand.
 */
export async function resolveBrandDb(supabase: SupabaseClient, input: string | null | undefined): Promise<BrandResolution> {
  const text = (input ?? "").trim();
  if (!text) {
    return { id: null, name: "", tier: DEFAULT_BRAND_TIER, matched: false, warning: "No brand given — priced as Regular high street." };
  }
  const { data } = await supabase.from("brands").select("id, name, tier").eq("active", true).limit(5000);
  const hit = matchBrand(text, (data ?? []) as { id: number; name: string; tier: string }[]);
  if (hit) {
    return {
      id: hit.brand.id,
      name: hit.brand.name,
      tier: hit.brand.tier as BrandTier,
      matched: true,
      ...(hit.corrected && text !== hit.brand.name ? { corrected_from: text } : {}),
    };
  }
  const name = normaliseBrand(text);
  return {
    id: null,
    name,
    tier: DEFAULT_BRAND_TIER,
    matched: false,
    is_new: true,
    ...(name !== text ? { corrected_from: text } : {}),
    warning: `New brand "${name}" — priced as Regular high street until a manager sets its tier.`,
  };
}

/* ------------------------------------------------------------------- lots */

export type DbLot = {
  id: number;
  code: string;
  supplier: string;
  basis: LotBasis;
  rate: number | null;
  kgBought: number | null;
  kgTagged: number | null;
  provisionalYield: number;
  status: "open" | "closed" | "split";
  parentLotId: number | null;
  arrivedOn: string | null;
  notes: string | null;
  description: string | null;
  /** Pieces bought — per-piece lots only */
  pieces: number | null;
  imported: boolean;
  /** Null when the lot has no rate yet — it cannot price garments */
  effectiveRate: number | null;
  yield: number;
};

type LotRow = {
  id: number;
  code: string;
  supplier: string;
  basis: string;
  rate: number | string | null;
  kg: number | string | null;
  kg_tagged: number | string | null;
  provisional_yield: number | string;
  status: string;
  parent_lot_id: number | null;
  arrived_on: string | null;
  notes: string | null;
  description?: string | null;
  pieces?: number | null;
  imported?: boolean | null;
};

export const LOT_COLUMNS = "id, code, supplier, basis, rate, kg, kg_tagged, provisional_yield, status, parent_lot_id, arrived_on, notes, description, pieces, imported";

export function lotFromRow(row: LotRow, settings: Settings): DbLot {
  const cost: LotCost = {
    basis: row.basis as LotBasis,
    rate: row.rate == null ? 0 : num(row.rate),
    kgBought: row.kg == null ? null : num(row.kg),
    kgTagged: row.kg_tagged == null ? null : num(row.kg_tagged),
    provisionalYield: num(row.provisional_yield, settings.defaultProvisionalYield),
  };
  return {
    id: row.id,
    code: row.code,
    supplier: row.supplier,
    basis: cost.basis,
    rate: row.rate == null ? null : cost.rate,
    kgBought: cost.kgBought ?? null,
    kgTagged: cost.kgTagged ?? null,
    provisionalYield: cost.provisionalYield ?? settings.defaultProvisionalYield,
    status: row.status as DbLot["status"],
    parentLotId: row.parent_lot_id,
    arrivedOn: row.arrived_on,
    notes: row.notes,
    description: row.description ?? null,
    pieces: row.pieces ?? null,
    imported: row.imported ?? true,
    effectiveRate: row.rate == null ? null : effectiveRate(cost, settings),
    yield: lotYield(cost, settings),
  };
}

/**
 * Lots are owned by the commercial software (12 Sep); the tagging app reads
 * only the number, description, quantity and status. Financial columns are
 * never selected here. Pricing does not look at the lot.
 */
export type LotRef = { id: number; code: string; description: string | null; pieces: number | null; status: string };
const LOT_REF_COLUMNS = "id, code, description, pieces, status";

export async function loadLot(supabase: SupabaseClient, id: number): Promise<LotRef | null> {
  const { data } = await supabase.from("lots").select(LOT_REF_COLUMNS).eq("id", id).maybeSingle();
  return (data as LotRef | null) ?? null;
}

export async function loadOpenLots(supabase: SupabaseClient): Promise<(LotRef & { tagged: number })[]> {
  const { data } = await supabase.from("lots").select(LOT_REF_COLUMNS).eq("status", "open").order("created_at", { ascending: false }).limit(100);
  const lots = (data ?? []) as LotRef[];
  if (!lots.length) return [];
  const { data: counts } = await supabase.from("items").select("lot_id").in("lot_id", lots.map((l) => l.id)).limit(200000);
  const n = new Map<number, number>();
  for (const c of counts ?? []) n.set(c.lot_id, (n.get(c.lot_id) ?? 0) + 1);
  return lots.map((l) => ({ ...l, tagged: n.get(l.id) ?? 0 }));
}
