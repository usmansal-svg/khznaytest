import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { comparePrice, safeDown, type ReferenceRow } from "./compare";

const settings = { compareFactorRegular: 3, compareFactorAffordable: 3.5, compareFormulaEnabled: true };
const base = { brandId: 7, tier: "affordable_luxury", subCategorySlug: "sms-sports-t-shirt", categorySlug: "men-activewear-sports-top", marketPrice: null, premiumPrice: 1990, ourPrice: 1990, settings };
const rows: ReferenceRow[] = [
  { brand_id: 7, tier: null, sub_category_slug: "sms-sports-t-shirt", category_slug: null, new_price_pkr: 8450, source: "founder", confirmed: true },
  { brand_id: 7, tier: null, sub_category_slug: null, category_slug: "men-activewear-sports-top", new_price_pkr: 7000, source: "research", confirmed: false },
  { brand_id: null, tier: "affordable_luxury", sub_category_slug: null, category_slug: "men-activewear-sports-top", new_price_pkr: 6000, source: "research", confirmed: false },
];

describe("comparison price", () => {
  it("rounds down to a safe step", () => {
    assert.equal(safeDown(8450), 8400);
    assert.equal(safeDown(12490), 12000);
    assert.equal(safeDown(999), 900);
  });

  it("most specific source wins and the saving rounds down", () => {
    const c = comparePrice(base, rows)!;
    assert.equal(c.new_price, 8400);
    assert.equal(c.saving_pct, Math.floor(((8400 - 1990) / 8400) * 100));
    assert.match(c.source, /brand × sub-category/);
    assert.equal(c.confirmed, true);
  });

  it("falls back brand × category, then tier × category", () => {
    assert.equal(comparePrice({ ...base, subCategorySlug: "other" }, rows)!.new_price, 7000);
    assert.equal(comparePrice({ ...base, brandId: 99, subCategorySlug: "other" }, rows)!.new_price, 6000);
  });

  it("uses the market price, then the formula, then nothing", () => {
    assert.equal(comparePrice({ ...base, brandId: 99, tier: "regular", categorySlug: "x", marketPrice: 5550 }, rows)!.new_price, 5500);
    const f = comparePrice({ ...base, brandId: 99, tier: "regular", categorySlug: "x", premiumPrice: 1790, ourPrice: 1790 }, rows)!;
    assert.equal(f.new_price, safeDown(1790 * 3));
    assert.equal(f.source, "formula");
    assert.equal(comparePrice({ ...base, brandId: 99, tier: "regular", categorySlug: "x", settings: { ...settings, compareFormulaEnabled: false } }, rows), null);
    assert.equal(comparePrice({ ...base, brandId: 99, tier: "ultra_luxury", categorySlug: "x" }, rows), null);
  });

  it("never prints a saving that is not one", () => {
    assert.equal(comparePrice({ ...base, ourPrice: 9000 }, rows), null);
  });
});
