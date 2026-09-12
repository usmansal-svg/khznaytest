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
/**
 * Who the garment is for (12 Sep list from Usman): adults, then age bands
 * with a boy/girl split. The first eleven are offered on the tag form; the
 * rest are legacy values kept valid for garments tagged before.
 */
export const WEARERS = ["men", "women", "unisex", "teen_boy", "teen_girl", "kids_boy", "kids_girl", "toddler_boy", "toddler_girl", "infant_boy", "infant_girl", "teenage", "kid", "toddler", "infant", "boy", "girl"] as const;
export const WEARER_OPTIONS = WEARERS.slice(0, 11) as unknown as readonly Wearer[];
export const WEARER_LABELS: Record<Wearer, string> = {
  men: "Men", women: "Women", unisex: "Unisex adult",
  teen_boy: "Teen boy (9–14 years)", teen_girl: "Teen girl (9–14 years)",
  kids_boy: "Kids boy (2–8 years)", kids_girl: "Kids girl (2–8 years)",
  toddler_boy: "Toddler boy (12–24 months)", toddler_girl: "Toddler girl (12–24 months)",
  infant_boy: "Infant boy (0–12 months)", infant_girl: "Infant girl (0–12 months)",
  teenage: "Teenage", kid: "Kid", toddler: "Toddler", infant: "Infant", boy: "Boy", girl: "Girl",
};
/** Which catalogue genders a wearer is tagged under. */
export const WEARER_GENDERS: Record<Wearer, Gender[]> = {
  men: ["men"], women: ["women"], unisex: ["men", "women", "teenage", "kid", "toddler", "infant"],
  teen_boy: ["teenage", "kid"], teen_girl: ["teenage", "kid"],
  kids_boy: ["kid", "teenage"], kids_girl: ["kid", "teenage"],
  toddler_boy: ["toddler", "kid"], toddler_girl: ["toddler", "kid"],
  infant_boy: ["infant", "toddler"], infant_girl: ["infant", "toddler"],
  teenage: ["teenage"], kid: ["kid"], toddler: ["toddler"], infant: ["infant"], boy: ["kid", "toddler", "teenage"], girl: ["kid", "toddler", "teenage"],
};
/** Anyone under adult: kids size series on the tag form, Kids tags on Shopify. */
export const isChildWearer = (w: string | null | undefined) => !!w && !["men", "women", "unisex"].includes(w);
export type Season = (typeof SEASONS)[number];
export type Wearer = (typeof WEARERS)[number];

const SEASON_CODE: Record<Season, string> = { summer: "S", winter: "W", all_season: "A" };
const WEARER_CODE: Record<Wearer, string> = { men: "M", women: "W", unisex: "U", teen_boy: "T", teen_girl: "N", kids_boy: "B", kids_girl: "G", toddler_boy: "D", toddler_girl: "L", infant_boy: "I", infant_girl: "J", teenage: "T", kid: "K", toddler: "D", infant: "I", boy: "B", girl: "G" };

export function buildSku(season: Season, wearer: Wearer, subCategoryCode: string, seq: number): string {
  return `KHZ-${SEASON_CODE[season]}${WEARER_CODE[wearer]}-${subCategoryCode}-${String(seq).padStart(5, "0")}`;
}

export const SKU_PATTERN = /^KHZ-[SWA][MWUTNBGDLIJK]-[A-Z]{3}-\d{5}$/;
