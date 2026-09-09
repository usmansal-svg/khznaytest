/**
 * SKU format (spec 5.2): KHZ-{season}{wearer}-{3-letter sub-category}-{5-digit sequence}
 * e.g. KHZ-SM-MBD-00042. The sequence comes from next_sku_seq() in the
 * database — server-side and atomic, the one hard requirement.
 */

export const SEASONS = ["summer", "winter", "all_season"] as const;
/** The category's gender is the garment's wearer. Old values stay valid for existing rows. */
export const GENDERS = ["men", "women", "teenage", "kid", "toddler", "infant"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS: Record<Gender, string> = { men: "Men", women: "Women", teenage: "Teenage", kid: "Kid", toddler: "Toddler", infant: "Infant" };
export const WEARERS = ["men", "women", "teenage", "kid", "toddler", "infant", "boy", "girl", "unisex"] as const;
export type Season = (typeof SEASONS)[number];
export type Wearer = (typeof WEARERS)[number];

const SEASON_CODE: Record<Season, string> = { summer: "S", winter: "W", all_season: "A" };
const WEARER_CODE: Record<Wearer, string> = { men: "M", women: "W", teenage: "T", kid: "K", toddler: "D", infant: "I", boy: "B", girl: "G", unisex: "U" };

export function buildSku(season: Season, wearer: Wearer, subCategoryCode: string, seq: number): string {
  return `KHZ-${SEASON_CODE[season]}${WEARER_CODE[wearer]}-${subCategoryCode}-${String(seq).padStart(5, "0")}`;
}

export const SKU_PATTERN = /^KHZ-[SWA][MWTKDIBGU]-[A-Z]{3}-\d{5}$/;
