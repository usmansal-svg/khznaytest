/** Kids sizing — spec section 4.3. Copy the label exactly; add the height range beside it. */
export type KidsSize = { label: string; heightCm: string; measure: "Length" | "Chest / Waist" };

export const KIDS_SIZES: readonly KidsSize[] = [
  { label: "0–3 M", heightCm: "56–62", measure: "Length" },
  { label: "3–6 M", heightCm: "62–68", measure: "Length" },
  { label: "6–12 M", heightCm: "68–80", measure: "Length" },
  { label: "12–18 M", heightCm: "80–86", measure: "Length" },
  { label: "18–24 M", heightCm: "86–92", measure: "Length" },
  { label: "2–3 Y", heightCm: "92–98", measure: "Chest / Waist" },
  { label: "3–4 Y", heightCm: "98–104", measure: "Chest / Waist" },
  { label: "4–5 Y", heightCm: "104–110", measure: "Chest / Waist" },
  { label: "5–6 Y", heightCm: "110–116", measure: "Chest / Waist" },
  { label: "6–7 Y", heightCm: "116–122", measure: "Chest / Waist" },
  { label: "7–8 Y", heightCm: "122–128", measure: "Chest / Waist" },
  { label: "8–9 Y", heightCm: "128–134", measure: "Chest / Waist" },
  { label: "9–10 Y", heightCm: "134–140", measure: "Chest / Waist" },
  { label: "10–11 Y", heightCm: "140–146", measure: "Chest / Waist" },
  { label: "11–12 Y", heightCm: "146–152", measure: "Chest / Waist" },
  { label: "13–14 Y", heightCm: "158–164", measure: "Chest / Waist" },
];

export const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "28", "30", "32", "34", "36", "38", "40", "42"];
