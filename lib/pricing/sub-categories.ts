/**
 * Reference data — Part One, section 4.1 of the build specification.
 *
 * 83 sub-categories. Weight drives cost, profile drives the multiple, and the
 * value index corrects for items worth more or less than their weight
 * suggests. `measureType` drives which measurement fields the tagging form
 * shows.
 *
 * Every price traces back to these weights and they are currently estimates
 * (section 9, open item 1) — weigh 20 pieces per category and replace them.
 */

import type { ProfileCode } from "./constants";

/**
 * Measured flat, in inches. Tops and outerwear also ask the sleeve type
 * (half / full) before a garment can be saved.
 */
export type MeasureType = "top" | "bottom" | "dress" | "outer" | "kids_top" | "kids_bottom";

export const MEASUREMENT_FIELDS: Readonly<Record<MeasureType, readonly string[]>> = {
  top: ["Chest", "Length"],
  bottom: ["Waist", "Length"],
  dress: ["Bust", "Waist", "Length"],
  outer: ["Chest", "Length"],
  kids_top: ["Chest", "Length"],
  kids_bottom: ["Waist", "Length"],
};

/**
 * What the tagger measures, flat in inches, for one garment: the type's
 * fields, "Bust" instead of "Chest" for women, and a sleeve length only when
 * the garment has full sleeves — a thrift customer needs exactly these to
 * know whether it fits.
 */
export function measurementFields(measureType: MeasureType, gender: string | null | undefined, sleeve: string | null | undefined): string[] {
  const base = MEASUREMENT_FIELDS[measureType].map((f) => (f === "Chest" && gender === "women" ? "Bust" : f));
  if (ASKS_SLEEVE.has(measureType) && sleeve === "Full sleeve") base.push("Sleeve length");
  return base;
}

/** Garment types that need the sleeve question answered. */
export const ASKS_SLEEVE: ReadonlySet<MeasureType> = new Set(["top", "outer", "kids_top", "dress"]);
export const SLEEVE_TYPES = ["Half sleeve", "Full sleeve", "Sleeveless"] as const;

export type Category = {
  slug: string;
  name: string;
  sortOrder: number;
};

export const CATEGORIES: readonly Category[] = [
  { slug: "summer-men-tops-fashion", name: "Summer Men Tops Fashion", sortOrder: 1 },
  { slug: "summer-men-bottoms-fashion", name: "Summer Men Bottoms Fashion", sortOrder: 2 },
  { slug: "summer-men-sports", name: "Summer Men Sports", sortOrder: 3 },
  { slug: "winter-men-fashion", name: "Winter Men Fashion", sortOrder: 4 },
  { slug: "winter-men-sports", name: "Winter Men Sports", sortOrder: 5 },
  { slug: "summer-women-tops-fashion", name: "Summer Women Tops Fashion", sortOrder: 6 },
  { slug: "summer-women-bottoms", name: "Summer Women Bottoms", sortOrder: 7 },
  { slug: "summer-women-sports", name: "Summer Women Sports", sortOrder: 8 },
  { slug: "winter-women-fashion", name: "Winter Women Fashion", sortOrder: 9 },
  { slug: "winter-women-sports", name: "Winter Women Sports", sortOrder: 10 },
  { slug: "children-summer", name: "Children Summer", sortOrder: 11 },
  { slug: "children-winter", name: "Children Winter", sortOrder: 12 },
  { slug: "palazzo", name: "Palazzo", sortOrder: 13 },
  { slug: "reon-pajama", name: "Reon Pajama", sortOrder: 14 },
];

export type SubCategory = {
  /** Unique across the catalogue — names repeat between men's and women's */
  slug: string;
  /** Three letters, unique, embedded in every SKU — never change once items exist */
  code: string;
  categorySlug: string;
  name: string;
  weightKg: number;
  profileCode: ProfileCode;
  valueIndex: number;
  measureType: MeasureType;
  /** Section 9, open item 4: cost-led pricing runs above market on outerwear */
  marketCeiling: number | null;
  perPieceShare: number;
  perPieceCost: number | null;
  active: boolean;
};

type Row = [name: string, weightKg: number, profileCode: ProfileCode, valueIndex: number, measureType: MeasureType, code: string];

function rows(categorySlug: string, prefix: string, list: Row[]): SubCategory[] {
  return list.map(([name, weightKg, profileCode, valueIndex, measureType, code]) => ({
    slug: `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    code,
    categorySlug,
    name,
    weightKg,
    profileCode,
    valueIndex,
    measureType,
    marketCeiling: null,
    perPieceShare: 0,
    perPieceCost: null,
    active: true,
  }));
}

export const SUB_CATEGORIES: readonly SubCategory[] = [
  ...rows("summer-men-tops-fashion", "smt", [
    ["Men T-shirt", 0.2, "fast", 1.1, "top", "MTS"],
    ["Men Polo shirt", 0.25, "fast", 1.05, "top", "MPO"],
    ["Men Button-down shirt", 0.3, "fast", 1.0, "top", "MBD"],
  ]),
  ...rows("summer-men-bottoms-fashion", "smb", [
    ["Men Shorts", 0.3, "fast", 1.1, "bottom", "MSH"],
    ["Men Cotton pants / chinos", 0.45, "standard", 1.0, "bottom", "MCP"],
    ["Men Dress pants", 0.4, "slow", 0.9, "bottom", "MDP"],
    ["Men Jeans", 0.65, "fast", 1.0, "bottom", "MJN"],
  ]),
  ...rows("summer-men-sports", "sms", [
    ["Sports T-shirt", 0.18, "fast", 1.1, "top", "STS"],
    ["Sports Polo T-shirt", 0.22, "fast", 1.05, "top", "SPO"],
    ["Sports Shorts", 0.22, "fast", 1.1, "bottom", "SSH"],
  ]),
  ...rows("winter-men-fashion", "wmf", [
    ["Heavy long coat", 1.6, "slow", 0.6, "outer", "MHC"],
    ["Light long coat", 1.0, "slow", 0.75, "outer", "MLC"],
    ["Heavy puffer jacket", 1.2, "standard", 0.75, "outer", "MHP"],
    ["Light puffer jacket", 0.7, "standard", 0.95, "outer", "MLP"],
    ["Blazer", 0.8, "slow", 0.85, "outer", "MBZ"],
    ["Sweater", 0.5, "fast", 1.05, "top", "MSW"],
    ["Sweatshirt", 0.55, "fast", 1.0, "top", "MSS"],
    ["Heavy hoodie", 0.75, "fast", 0.95, "top", "MHH"],
    ["Light hoodie", 0.5, "fast", 1.1, "top", "MLH"],
    ["Heavy zip-up", 0.8, "standard", 0.9, "outer", "MHZ"],
    ["Light zip-up", 0.55, "standard", 1.05, "outer", "MLZ"],
    ["Heavy bomber jacket", 1.0, "slow", 0.8, "outer", "MHB"],
    ["Light bomber jacket", 0.65, "standard", 1.0, "outer", "MLB"],
    ["Heavy denim jacket", 1.0, "slow", 0.8, "outer", "MHD"],
    ["Light denim jacket", 0.7, "standard", 1.0, "outer", "MLD"],
    ["Heavy windbreaker", 0.55, "slow", 1.0, "outer", "MHW"],
    ["Light windbreaker", 0.35, "slow", 1.2, "outer", "MLW"],
    ["Leather jacket", 1.8, "slow", 0.85, "outer", "MLJ"],
  ]),
  ...rows("winter-men-sports", "wms", [
    ["Sports Sweatpants", 0.5, "fast", 1.05, "bottom", "SSP"],
    ["Sports Hoodie", 0.65, "fast", 1.0, "top", "SHD"],
    ["Sports Zip-up", 0.7, "fast", 0.95, "outer", "SZP"],
    ["Long sleeve T-shirt", 0.25, "fast", 1.15, "top", "SLT"],
    ["Long sleeve Polo shirt", 0.3, "fast", 1.1, "top", "SLP"],
  ]),
  ...rows("summer-women-tops-fashion", "swt", [
    ["Women Dress", 0.35, "standard", 1.15, "dress", "WDR"],
    ["Women Blouse", 0.2, "standard", 1.3, "top", "WBL"],
    ["Women T-shirt", 0.15, "fast", 1.2, "top", "WTS"],
    ["Women Button-down shirt", 0.22, "slow", 1.1, "top", "WBD"],
    ["Women Polo shirt", 0.2, "slow", 1.05, "top", "WPO"],
    ["Women Top", 0.15, "fast", 1.3, "top", "WTP"],
  ]),
  ...rows("summer-women-bottoms", "swb", [
    ["Women Jeans", 0.55, "fast", 1.05, "bottom", "WJN"],
    ["Women Casual pants", 0.35, "slow", 1.1, "bottom", "WCP"],
    ["Women Skirt", 0.25, "slow", 1.2, "bottom", "WSK"],
    ["Women Shorts", 0.22, "slow", 1.15, "bottom", "WSH"],
  ]),
  ...rows("summer-women-sports", "sws", [
    ["Sports Bra", 0.1, "fast", 1.6, "top", "WSB"],
    ["Women Sports T-shirt", 0.15, "fast", 1.25, "top", "WST"],
    ["Women Sports Shorts", 0.18, "standard", 1.2, "bottom", "WSS"],
  ]),
  ...rows("winter-women-fashion", "wwf", [
    ["Heavy long coat", 1.35, "slow", 0.65, "outer", "WHC"],
    ["Light long coat", 0.85, "slow", 0.8, "outer", "WLC"],
    ["Heavy puffer jacket", 1.0, "standard", 0.8, "outer", "WHP"],
    ["Light puffer jacket", 0.6, "standard", 1.0, "outer", "WLP"],
    ["Blazer", 0.65, "slow", 0.9, "outer", "WBZ"],
    ["Sweater", 0.42, "fast", 1.1, "top", "WSW"],
    ["Sweatshirt", 0.45, "fast", 1.05, "top", "WSU"],
    ["Heavy hoodie", 0.62, "fast", 1.0, "top", "WHH"],
    ["Light hoodie", 0.42, "fast", 1.15, "top", "WLH"],
    ["Heavy zip-up", 0.68, "standard", 0.95, "outer", "WHZ"],
    ["Light zip-up", 0.46, "standard", 1.1, "outer", "WLZ"],
    ["Heavy bomber jacket", 0.85, "slow", 0.85, "outer", "WHB"],
    ["Light bomber jacket", 0.55, "standard", 1.05, "outer", "WLB"],
    ["Heavy denim jacket", 0.85, "slow", 0.85, "outer", "WHD"],
    ["Light denim jacket", 0.6, "standard", 1.05, "outer", "WLD"],
    ["Heavy windbreaker", 0.47, "slow", 1.05, "outer", "WHW"],
    ["Light windbreaker", 0.3, "slow", 1.25, "outer", "WLW"],
    ["Leather jacket", 1.5, "slow", 0.9, "outer", "WLJ"],
  ]),
  ...rows("winter-women-sports", "wws", [
    ["Women Sweatpants", 0.42, "fast", 1.1, "bottom", "WSP"],
    ["Women Sports Hoodie", 0.55, "fast", 1.05, "top", "WSD"],
    ["Women Sports Zip-up", 0.58, "standard", 1.0, "outer", "WSZ"],
    ["Women Long sleeve T-shirt", 0.2, "standard", 1.2, "top", "WLT"],
    ["Women Long sleeve Polo", 0.25, "standard", 1.15, "top", "WLO"],
  ]),
  ...rows("children-summer", "chs", [
    ["Kids T-shirt", 0.1, "fast", 1.15, "kids_top", "KTS"],
    ["Kids Shorts", 0.12, "standard", 1.15, "kids_bottom", "KSH"],
    ["Kids Dress", 0.15, "standard", 1.25, "kids_top", "KDR"],
    ["Kids Skirt", 0.1, "slow", 1.2, "kids_bottom", "KSK"],
    ["Kids Polo shirt", 0.12, "standard", 1.1, "kids_top", "KPO"],
    ["Kids Trousers", 0.2, "slow", 1.05, "kids_bottom", "KTR"],
  ]),
  ...rows("children-winter", "chw", [
    ["Kids Hoodie", 0.3, "fast", 1.1, "kids_top", "KHD"],
    ["Kids Sweater", 0.25, "fast", 1.1, "kids_top", "KSW"],
    ["Kids Puffer jacket", 0.45, "standard", 0.95, "kids_top", "KPF"],
    ["Kids Sweatshirt", 0.25, "fast", 1.05, "kids_top", "KSS"],
    ["Kids Sweatpants", 0.22, "standard", 1.1, "kids_bottom", "KSP"],
    ["Kids Jacket", 0.4, "standard", 1.0, "kids_top", "KJK"],
  ]),
  ...rows("palazzo", "plz", [["Palazzo", 0.22, "fast", 1.1, "bottom", "PLZ"]]),
  ...rows("reon-pajama", "rpj", [["Reon Pajama", 0.22, "fast", 1.05, "bottom", "RPJ"]]),
];

export function subCategoryByCode(code: string): SubCategory | undefined {
  return SUB_CATEGORIES.find((s) => s.code === code);
}

export function subCategory(slug: string): SubCategory {
  const found = SUB_CATEGORIES.find((s) => s.slug === slug);
  if (!found) throw new Error(`Unknown sub-category: ${slug}`);
  return found;
}
