/**
 * SKU format (spec 5.2): KHZ-{season}{wearer}-{3-letter sub-category}-{5-digit sequence}
 * e.g. KHZ-SM-MBD-00042. The sequence comes from next_sku_seq() in the
 * database — server-side and atomic, the one hard requirement.
 */

export const SEASONS = ["summer", "winter", "all_season"] as const;
export const WEARERS = ["men", "women", "boy", "girl", "infant", "unisex"] as const;
export type Season = (typeof SEASONS)[number];
export type Wearer = (typeof WEARERS)[number];

const SEASON_CODE: Record<Season, string> = { summer: "S", winter: "W", all_season: "A" };
const WEARER_CODE: Record<Wearer, string> = { men: "M", women: "W", boy: "B", girl: "G", infant: "I", unisex: "U" };

export function buildSku(season: Season, wearer: Wearer, subCategoryCode: string, seq: number): string {
  return `KHZ-${SEASON_CODE[season]}${WEARER_CODE[wearer]}-${subCategoryCode}-${String(seq).padStart(5, "0")}`;
}

export const SKU_PATTERN = /^KHZ-[SWA][MWBGIU]-[A-Z]{3}-\d{5}$/;
