/**
 * Contract test for the price quote — the /api/price response shape — run
 * against the built-in defaults so it needs no database. POST /api/price is
 * a thin wrapper that loads the same context from Supabase.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveBrand } from "./brands";
import { BRAND_TIERS, DEFAULT_SETTINGS, GRADES, PROFILES, SETTINGS_VERSION, type Adjustment, type GradeCode } from "./constants";
import { quote } from "./quote";
import type { DbLot, PricingContext } from "./repo";
import { SUB_CATEGORIES } from "./sub-categories";

const ctx: PricingContext = {
  settings: DEFAULT_SETTINGS,
  settingsVersion: SETTINGS_VERSION,
  refs: { grades: GRADES, profiles: PROFILES, brandTiers: BRAND_TIERS },
  subCategories: SUB_CATEGORIES.map((s) => ({ ...s, gender: /women/.test(s.categorySlug) ? "women" : /children/.test(s.categorySlug) ? "kid" : "men", standardCost: null, heavyCost: null, affordableLuxuryMultiplier: null, marketPrice: null, season: "all" as const })),
  source: "database",
};

const lotS: DbLot = { id: 1, code: "LOT-B-01-S", supplier: "B", basis: "kg", rate: 6, kgBought: 27, kgTagged: 25, provisionalYield: 0.9, status: "closed", parentLotId: null, arrivedOn: null, notes: null, description: null, pieces: null, imported: true, effectiveRate: 6 / (25 / 27), yield: 25 / 27 };
const lotPc: DbLot = { id: 2, code: "LOT-A-01", supplier: "A", basis: "pc", rate: 600, kgBought: null, kgTagged: null, provisionalYield: 0.9, status: "open", parentLotId: null, arrivedOn: null, notes: null, description: null, pieces: null, imported: true, effectiveRate: 600, yield: 1 };

// Without a lot the sub-category prices from its cost per piece (Rs 650 here, the men's shirt example); the lot path stays for the engine tests.
function q(slug: string, opts: { brand?: string; grade?: GradeCode; adjustment?: Adjustment; rare?: boolean; lot?: DbLot | null; weight?: number | null; cost?: number | null } = {}) {
  const base = ctx.subCategories.find((s) => s.slug === slug)!;
  const subCategory = { ...base, standardCost: opts.cost !== undefined ? opts.cost : opts.lot === undefined ? 650 : null };
  return quote(
    { subCategory, brand: { id: null, ...resolveBrand(opts.brand ?? "") }, grade: opts.grade ?? "premium", adjustment: opts.adjustment ?? "standard", isRare: opts.rare ?? false, lot: opts.lot, weightKg: opts.weight },
    ctx,
  );
}

describe("price quote", () => {
  it("a standard cost per garment wins over the lot: one shelf price whichever vendor", () => {
    const std = { ...ctx, subCategories: ctx.subCategories.map((s) => (s.slug === "sms-sports-t-shirt" ? { ...s, standardCost: 550 } : s)) };
    const sc = std.subCategories.find((s) => s.slug === "sms-sports-t-shirt")!;
    const cheap = quote({ subCategory: sc, brand: { id: null, ...resolveBrand("Nike") }, grade: "premium", adjustment: "standard", isRare: false, lot: { ...lotS, rate: 5 }, weightKg: 0.2 }, std);
    const dear = quote({ subCategory: sc, brand: { id: null, ...resolveBrand("Nike") }, grade: "premium", adjustment: "standard", isRare: false, lot: { ...lotS, rate: 10 }, weightKg: 0.2 }, std);
    assert.equal(cheap.cost_basis, "standard");
    // The sheet's cost per piece is the purchase cost before sales tax; landed adds the non-recoverable input tax.
    assert.equal(cheap.landed_cost, Math.round(550 * (1 + DEFAULT_SETTINGS.inputTaxRate * (1 - DEFAULT_SETTINGS.inputTaxRecover)) * 100) / 100);
    assert.equal(cheap.price, dear.price);
    assert.equal(cheap.weight_kg, null);
  });

  it("prices the section 9 worked example from a lot and scale weight", () => {
    const r = q("smt-men-button-down-shirt", { brand: "Zara", lot: lotS, weight: 0.31 });
    assert.equal(r.cost_basis, "lot");
    assert.equal(r.lot?.effective_rate, 6.48);
    assert.equal(r.landed_cost, 624.04);
    assert.equal(r.price, 2090);
    assert.deepEqual(r.markdowns.map((m) => m.price), [1590, 1090, 490]);
    assert.equal(r.grade_prices!.very_good, 1290);
    assert.ok(r.expected_revenue! > r.landed_cost);
    assert.equal(r.sub_category.code, "MBD");
  });

  it("per-piece lots ignore weight", () => {
    const r = q("sms-sports-t-shirt", { lot: lotPc, weight: null });
    assert.equal(r.landed_cost, 643.2);
    assert.equal(r.price, 2390);
    assert.equal(r.weight_kg, null);
  });

  it("a kg lot without a weight is an error, not a guess", () => {
    const r = q("smt-men-t-shirt", { lot: lotS, weight: null });
    assert.match(r.error!, /weigh/i);
    assert.equal(r.price, null);
  });

  it("a lot without a rate cannot price", () => {
    const r = q("smt-men-t-shirt", { lot: { ...lotS, rate: null, effectiveRate: null }, weight: 0.2 });
    assert.match(r.error!, /no rate/i);
  });

  it("rejected prices 0 and still reports the landed cost", () => {
    const r = q("smt-men-t-shirt", { lot: lotS, weight: 0.2, grade: "rejected" });
    assert.equal(r.price, 0);
    assert.equal(Math.round(r.landed_cost), 403);
    assert.deepEqual(r.markdowns, []);
    assert.equal(r.expected_revenue, Math.round(r.landed_cost * DEFAULT_SETTINGS.bulkRecovery * 100) / 100);
  });

  it("with no cost per piece and no lot cost it refuses to guess", () => {
    const r = q("smt-men-button-down-shirt", { brand: "Zara", cost: null });
    assert.match(r.error ?? "", /No cost per piece/);
    assert.equal(r.price, null);
  });

  it("affordable luxury resolves from the brand, never from the tagger", () => {
    const r = q("smt-men-button-down-shirt", { brand: "nike" });
    assert.equal(r.brand_tier, "affordable_luxury");
    assert.equal(r.price, 4690);
  });

  it("ultra luxury blocks with a reason and no price", () => {
    const r = q("wmf-leather-jacket", { brand: "Moncler" });
    assert.equal(r.price, null);
    assert.match(r.block_reason!, /manually/i);
  });

  it("a rare find prices as normal (rare is a flag and a note, decided at grading), and a rejected rare piece is just rejected", () => {
    const r = q("smt-men-t-shirt", { brand: "Zara", rare: true });
    assert.equal(r.block_reason, undefined);
    assert.equal(r.price, q("smt-men-t-shirt", { brand: "Zara" }).price);
    assert.equal(q("smt-men-t-shirt", { brand: "Zara", rare: true, grade: "rejected" }).price, 0);
  });

  it("unknown brands price as Regular and warn", () => {
    const r = q("smt-men-t-shirt", { brand: "Mystery Co" });
    assert.equal(r.brand_tier, "regular");
    assert.ok(r.warnings!.some((w) => /unknown brand/i.test(w)));
  });

});
