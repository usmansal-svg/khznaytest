/**
 * Brand tier lookup — Part One, section 4.2 of the build specification.
 *
 * INCOMPLETE SEED. The spec calls for 384 brands from `Khazanay_brand_tiers.csv`
 * (139 Regular, 145 Affordable Luxury, 100 Ultra Luxury). That file is not in
 * the repository, so this holds only the 26 brands named explicitly in the
 * spec prose. The rest must be imported before this is used in anger —
 * inventing tiers for the missing 358 would mis-price real stock.
 *
 * Until then every unmatched brand falls through to Regular with a warning,
 * which is the spec's stated behaviour for unknown brands anyway.
 */

import { DEFAULT_BRAND_TIER, type BrandTier } from "./constants";

export type Brand = {
  name: string;
  tier: BrandTier;
  active: boolean;
};

const seed: [string, BrandTier][] = [
  // Regular high street
  ["Zara", "regular"],
  ["H&M", "regular"],
  ["Primark", "regular"],
  ["Next", "regular"],
  ["George", "regular"],
  ["F&F", "regular"],
  ["Matalan", "regular"],
  ["Mango", "regular"],
  ["Uniqlo", "regular"],
  ["GAP", "regular"],
  // Affordable luxury
  ["Ralph Lauren", "affordable_luxury"],
  ["Tommy Hilfiger", "affordable_luxury"],
  ["Calvin Klein", "affordable_luxury"],
  ["Hugo Boss", "affordable_luxury"],
  ["Lacoste", "affordable_luxury"],
  ["Massimo Dutti", "affordable_luxury"],
  ["Nike", "affordable_luxury"],
  ["Adidas", "affordable_luxury"],
  ["Under Armour", "affordable_luxury"],
  ["The North Face", "affordable_luxury"],
  // Ultra luxury — manual pricing, never automatic
  ["Gucci", "ultra_luxury"],
  ["Prada", "ultra_luxury"],
  ["Burberry", "ultra_luxury"],
  ["Moncler", "ultra_luxury"],
  ["Canada Goose", "ultra_luxury"],
  ["Stone Island", "ultra_luxury"],
];

export const BRANDS: readonly Brand[] = seed.map(([name, tier]) => ({ name, tier, active: true }));

/** The spec's target. Used to keep the seeding gap visible rather than silent. */
export const EXPECTED_BRAND_COUNT = 384;

const byName = new Map(BRANDS.map((b) => [b.name.toLowerCase(), b]));

export type BrandResolution = {
  tier: BrandTier;
  /** The catalogue name when matched, otherwise whatever the tagger typed */
  name: string;
  matched: boolean;
  warning?: string;
};

/**
 * Resolve a typed brand name to a tier. Never judged by the tagger.
 * Unknown brands default to Regular with a visible warning.
 */
export function resolveBrand(input: string | null | undefined): BrandResolution {
  const text = (input ?? "").trim();
  if (!text) {
    return {
      tier: DEFAULT_BRAND_TIER,
      name: "",
      matched: false,
      warning: "No brand given — priced as Regular high street.",
    };
  }

  const hit = byName.get(text.toLowerCase());
  if (hit) return { tier: hit.tier, name: hit.name, matched: true };

  return {
    tier: DEFAULT_BRAND_TIER,
    name: text,
    matched: false,
    warning: `Unknown brand "${text}" — priced as Regular high street. Check the brand list.`,
  };
}

/** Prefix search for the tagging form's datalist. Section 12.1. */
export function searchBrands(query: string, limit = 20): Brand[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return BRANDS.filter((b) => b.active && b.name.toLowerCase().startsWith(q)).slice(0, limit);
}
