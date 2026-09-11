/**
 * Size buttons for the tag form. Typing on an iPad is slow; the label size
 * is almost always one of a short series, and which series depends on the
 * garment: a button-down shirt is sold by collar, jeans by waist, a dress by
 * UK number, everything else by letter. Kids garments use the age bands.
 */

export type SizeSeries = { code: "letters" | "collar" | "waist" | "uk" | "kids"; label: string; sizes: string[] };

export const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
export const COLLAR_SIZES = ["14", "14.5", "15", "15.5", "16", "16.5", "17", "17.5", "18"];
export const WAIST_SIZES = ["26", "28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42", "44"];
export const UK_DRESS_SIZES = ["6", "8", "10", "12", "14", "16", "18", "20", "22"];

const LETTERS: SizeSeries = { code: "letters", label: "Letters", sizes: LETTER_SIZES };
const COLLAR: SizeSeries = { code: "collar", label: "Collar", sizes: COLLAR_SIZES };
const WAIST: SizeSeries = { code: "waist", label: "Waist", sizes: WAIST_SIZES };
const UK: SizeSeries = { code: "uk", label: "UK size", sizes: UK_DRESS_SIZES };

/**
 * The series offered for a sub-category, default first. Letters are always
 * available; the numeric series is the one that garment is sold by.
 */
export function sizeSeriesFor(sub: { name: string; measure_type: string } | null | undefined, kidsLabels: string[], isKids: boolean): SizeSeries[] {
  if (isKids) return [{ code: "kids", label: "Age", sizes: kidsLabels }, LETTERS];
  if (!sub) return [LETTERS, WAIST];
  const name = sub.name.toLowerCase();
  const isShirt = /button-down|dress shirt|formal shirt/.test(name) || (/\bshirt\b/.test(name) && !/t-shirt|tee|polo|sweat|sports/.test(name));
  if (isShirt) return [COLLAR, LETTERS];
  if (sub.measure_type === "bottom") return [WAIST, LETTERS];
  if (sub.measure_type === "dress") return [LETTERS, UK];
  return [LETTERS, WAIST];
}
