/**
 * Contract test for the price quote — the section 13 response shape — run
 * against the built-in defaults so it needs no database. POST /api/price is
 * a thin wrapper that loads the same context from Supabase.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveBrand } from "./brands";
import { BRAND_TIERS, DEFAULT_SETTINGS, GRADES, PROFILES, SETTINGS_VERSION, type Adjustment, type GradeCode } from "./constants";
import { quote } from "./quote";
import type { PricingContext } from "./repo";
import { SUB_CATEGORIES } from "./sub-categories";

const ctx: PricingContext = {
  settings: DEFAULT_SETTINGS,
  settingsVersion: SETTINGS_VERSION,
  refs: { grades: GRADES, profiles: PROFILES, brandTiers: BRAND_TIERS },
  subCategories: SUB_CATEGORIES.map((s) => ({ ...s })),
  source: "database",
};

function price(slug: string, brand = "", grade: GradeCode = "premium", adjustment: Adjustment = "standard", isRare = false) {
  const subCategory = ctx.subCategories.find((s) => s.slug === slug)!;
  const b = resolveBrand(brand);
  return quote({ subCategory, brand: { id: null, ...b }, grade, adjustment, isRare }, ctx);
}

describe("price quote", () => {
  it("prices the worked example and returns the full ladder", () => {
    const q = price("smt-men-button-down-shirt", "Zara");
    assert.equal(q.price, 1790);
    assert.equal(q.landed_cost, 519.93);
    assert.equal(q.brand_tier, "regular");
    assert.deepEqual(q.markdowns.map((m) => m.price), [1290, 890, 390]);
    assert.equal(q.grade_prices!.very_good, 1090);
    assert.ok(q.gp_pct! > 0.6);
    assert.equal(q.settings_version, 1);
    assert.equal(q.sub_category.code, "MBD");
  });

  it("prices at the requested grade", () => {
    assert.equal(price("smt-men-button-down-shirt", "", "excellent").price, 1490);
  });

  it("affordable luxury resolves from the brand, never from the tagger", () => {
    const q = price("smt-men-button-down-shirt", "nike");
    assert.equal(q.brand_tier, "affordable_luxury");
    assert.equal(q.brand.name, "Nike");
    assert.equal(q.price, 3490);
  });

  it("ultra luxury blocks with a reason and no price", () => {
    const q = price("wmf-leather-jacket", "Moncler");
    assert.equal(q.price, null);
    assert.match(q.block_reason!, /manually/i);
    assert.deepEqual(q.markdowns, []);
  });

  it("rare pieces block even on a regular brand", () => {
    const q = price("smt-men-t-shirt", "Zara", "premium", "standard", true);
    assert.equal(q.price, null);
    assert.match(q.block_reason!, /rare/i);
  });

  it("unknown brands price as Regular and warn", () => {
    const q = price("smt-men-t-shirt", "Mystery Co");
    assert.equal(q.brand_tier, "regular");
    assert.equal(q.price, 1290);
    assert.ok(q.warnings!.some((w) => /unknown brand/i.test(w)));
  });

  it("flags high-value items for QC review", () => {
    const q = price("wmf-leather-jacket", "Zara");
    assert.equal(q.price, 12090);
    assert.ok(q.warnings!.some((w) => /QC review/i.test(w)));
  });

  it("warns when a market ceiling is exceeded", () => {
    const capped: PricingContext = {
      ...ctx,
      subCategories: ctx.subCategories.map((s) => (s.slug === "wmf-leather-jacket" ? { ...s, marketCeiling: 9000 } : s)),
    };
    const subCategory = capped.subCategories.find((s) => s.slug === "wmf-leather-jacket")!;
    const q = quote({ subCategory, brand: { id: null, ...resolveBrand("Zara") }, grade: "premium", adjustment: "standard", isRare: false }, capped);
    assert.ok(q.warnings!.some((w) => /market ceiling/i.test(w)));
  });

  it("surfaces a defaults fallback as a warning", () => {
    const q = quote(
      { subCategory: ctx.subCategories[0], brand: { id: null, ...resolveBrand("Zara") }, grade: "premium", adjustment: "standard", isRare: false },
      { ...ctx, source: "defaults", warning: "using built-in defaults" },
    );
    assert.equal(q.pricing_source, "defaults");
    assert.ok(q.warnings!.some((w) => /defaults/.test(w)));
  });
});
