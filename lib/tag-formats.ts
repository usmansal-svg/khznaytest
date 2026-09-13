/**
 * Paper sizes a tag can print on. Plain data with no React, so route
 * handlers and the print helper can import it too.
 */
export type TagFormat = "label2x1" | "label" | "label3x2" | "hang";
export const TAG_FORMATS: { code: TagFormat; label: string; size: string; w: number; h: number }[] = [
  { code: "label2x1", label: "2 × 1 in label", size: "50.8 × 25.4 mm", w: 50.8, h: 25.4 },
  { code: "label", label: "2.5 × 1.5 in label", size: "63.5 × 38.1 mm", w: 63.5, h: 38.1 },
  { code: "label3x2", label: "3 × 2 in label", size: "76.2 × 50.8 mm", w: 76.2, h: 50.8 },
  { code: "hang", label: "50 × 90 mm hang tag", size: "50 × 90 mm", w: 50, h: 90 },
];
export const isTagFormat = (v: unknown): v is TagFormat => TAG_FORMATS.some((f) => f.code === v);

/** One printer dot in mm at 203 dpi. Barcode widths are whole dots so every bar prints crisp. */
export const DOT_MM = 25.4 / 203;
/** The ZY909 starts printing this far left of the label's edge; layouts shift right by it. Measured from the first labels, 14 Sep 2026. */
export const PRINT_OFFSET_MM = 3;
