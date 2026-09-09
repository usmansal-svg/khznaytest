/**
 * "New in store" comparison price for the shelf tag, and the saving.
 *
 * Sources, most specific first:
 *   1. brand × sub-category      4. tier × category
 *   2. brand × category          5. the sub-category's market price
 *   3. tier × sub-category       6. formula: Premium price × factor per tier
 *
 * The printed figure is rounded DOWN to a safe step and the saving is
 * rounded down too, so the claim on the tag is never overstated. Nothing
 * is printed when no source applies.
 */

export type ReferenceRow = {
  brand_id: number | null;
  tier: string | null;
  sub_category_slug: string | null;
  category_slug: string | null;
  new_price_pkr: number;
  source: "founder" | "research" | "formula";
  confirmed: boolean;
};

export type CompareInput = {
  brandId: number | null;
  tier: string;
  subCategorySlug: string;
  categorySlug: string;
  /** The sub-category's market price from the pricing sheet, if any */
  marketPrice: number | null;
  /** The garment's Premium (grade-1.00, no adjustment) shelf price, for the formula */
  premiumPrice: number | null;
  ourPrice: number;
  settings: { compareFactorRegular: number; compareFactorAffordable: number; compareFormulaEnabled: boolean };
};

export type Compare = { new_price: number; saving_pct: number; source: string; confirmed: boolean } | null;

/** Round down to a step that reads as a real price: Rs 100 under 10k, Rs 500 above. */
export function safeDown(n: number): number {
  const step = n >= 10000 ? 500 : 100;
  return Math.floor(n / step) * step;
}

export function comparePrice(input: CompareInput, rows: readonly ReferenceRow[]): Compare {
  const { brandId, tier, subCategorySlug, categorySlug } = input;
  const pick = (test: (r: ReferenceRow) => boolean) => rows.find(test);
  const candidates: { row?: ReferenceRow; price: number | null; source: string; confirmed: boolean }[] = [
    { row: brandId != null ? pick((r) => r.brand_id === brandId && r.sub_category_slug === subCategorySlug) : undefined, price: null, source: "brand × sub-category", confirmed: false },
    { row: brandId != null ? pick((r) => r.brand_id === brandId && r.category_slug === categorySlug) : undefined, price: null, source: "brand × category", confirmed: false },
    { row: pick((r) => r.tier === tier && r.sub_category_slug === subCategorySlug), price: null, source: "tier × sub-category", confirmed: false },
    { row: pick((r) => r.tier === tier && r.category_slug === categorySlug), price: null, source: "tier × category", confirmed: false },
  ];
  for (const c of candidates) {
    if (c.row) return finish(c.row.new_price_pkr, `${c.row.source} · ${c.source}`, c.row.confirmed, input.ourPrice);
  }
  if (input.marketPrice && input.marketPrice > 0) return finish(input.marketPrice, "sub-category market price", true, input.ourPrice);
  if (input.settings.compareFormulaEnabled && input.premiumPrice && tier !== "ultra_luxury") {
    const factor = tier === "affordable_luxury" ? input.settings.compareFactorAffordable : input.settings.compareFactorRegular;
    return finish(input.premiumPrice * factor, "formula", false, input.ourPrice);
  }
  return null;
}

function finish(raw: number, source: string, confirmed: boolean, ourPrice: number): Compare {
  const newPrice = safeDown(raw);
  if (newPrice <= ourPrice) return null; // never print a "saving" that isn't one
  const saving = Math.floor(((newPrice - ourPrice) / newPrice) * 100);
  return { new_price: newPrice, saving_pct: saving, source, confirmed };
}
