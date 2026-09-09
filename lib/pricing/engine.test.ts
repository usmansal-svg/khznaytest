/**
 * Pricing engine tests — pins spec v2 section 9 (2026-09-09) and keeps the
 * earlier section 8 table, which still holds as a planning quote at the old
 * blended rate of 6.71 with default weights.
 *
 * Run with:  npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_SETTINGS, GRADES, PROFILES, type GradeCode, type LotCost, type ProfileCode } from "./constants";
import {
  blendedBrandUplift,
  blendedDiscount,
  charm,
  colourForMonth,
  computePrice,
  effectiveRate,
  expectedRevenue,
  gradeSum,
  landedCost,
  lotYield,
  profileMultiple,
  stageFor,
} from "./engine";
import { CATEGORIES, SUB_CATEGORIES, subCategory } from "./sub-categories";

/* ------------------------------------------------ section 4.2 — multiples */

describe("profile multiples", () => {
  const expected: Record<ProfileCode, number> = { fast: 3.394729, standard: 3.964005, slow: 4.576611 };
  for (const p of PROFILES) {
    it(`${p.name} multiple is ${expected[p.code]}`, () => {
      assert.equal(Number(profileMultiple(p.code).toFixed(6)), expected[p.code]);
    });
  }

  it("blended discount matches the published depths", () => {
    assert.equal(Number((blendedDiscount("fast") * 100).toFixed(3)), 13.875);
    assert.equal(Number((blendedDiscount("standard") * 100).toFixed(3)), 23.875);
    assert.equal(Number((blendedDiscount("slow") * 100).toFixed(3)), 31.875);
  });

  it("grade mix term ignores the rejected grade", () => {
    // (0.02*1.8 + 0.65*1.0 + 0.20*0.85 + 0.10*0.60) / 0.97 — rejected has multiplier 0
    assert.equal(Number(gradeSum().toFixed(6)), 0.94433);
  });

  it("slower profiles need a bigger multiple", () => {
    assert.ok(profileMultiple("fast") < profileMultiple("standard"));
    assert.ok(profileMultiple("standard") < profileMultiple("slow"));
  });
});

/* -------------------------------------------------- section 2 — lots */

const LOT_B_01_S: LotCost = { basis: "kg", rate: 6.0, kgBought: 27, kgTagged: 25 }; // closed: yield 0.926
const LOT_B_01_W: LotCost = { basis: "kg", rate: 6.0, kgBought: 30, kgTagged: null }; // open: provisional 0.90
const LOT_A_01: LotCost = { basis: "pc", rate: 600 };

describe("lots", () => {
  it("yield is kg tagged over kg bought once closed", () => {
    assert.equal(Number(lotYield(LOT_B_01_S).toFixed(3)), 0.926);
  });

  it("an open lot uses the provisional yield", () => {
    assert.equal(lotYield(LOT_B_01_W), 0.9);
    assert.equal(lotYield({ ...LOT_B_01_W, provisionalYield: 0.85 }), 0.85);
  });

  it("effective rate divides the vendor rate by yield for kg lots", () => {
    assert.equal(Number(effectiveRate(LOT_B_01_S).toFixed(2)), 6.48);
    assert.equal(Number(effectiveRate(LOT_B_01_W).toFixed(2)), 6.67);
  });

  it("per-piece lots pass the rate straight through", () => {
    assert.equal(effectiveRate(LOT_A_01), 600);
  });

  it("a local purchase pays no duty and gets no tax credit — cost is what was paid", () => {
    assert.equal(landedCost({ basis: "pc", effectiveRate: 600, weightKg: 0, imported: false }), 600);
    assert.equal(Number(landedCost({ basis: "pc", effectiveRate: 600, weightKg: 0 }).toFixed(2)), 535.2);
    const localKg = landedCost({ weightKg: 0.31, effectiveRate: 6.48, imported: false });
    assert.equal(Number(localKg.toFixed(2)), Number((0.31 * 6.48 * 283).toFixed(2)));
  });

  it("a five-point yield error moves a price by at most one step", () => {
    const at = (y: number) => computePrice({ weightKg: 0.31, effectiveRate: 6 / y, profileCode: "fast", valueIndex: 1 }).premiumPrice;
    assert.ok(Math.abs(at(0.9) - at(0.95)) <= DEFAULT_SETTINGS.charmStep);
  });
});

/* -------------------------------------------------- section 9 — the table */

describe("section 9 verification table", () => {
  type Row = [string, LotCost, string, number | null, GradeCode, "standard" | "above", number, number];
  // lot, sub-category, weight, grade, adjustment, expected landed (rounded), expected price
  const table: Row[] = [
    ["LOT-B-01-S", LOT_B_01_S, "smt-men-button-down-shirt", 0.31, "premium", "standard", 519, 1790],
    ["LOT-B-01-S", LOT_B_01_S, "smt-men-t-shirt", 0.21, "excellent", "standard", 352, 1090],
    ["LOT-B-01-W", LOT_B_01_W, "wmf-heavy-hoodie", 0.78, "premium", "above", 1343, 5190],
    ["LOT-A-01", LOT_A_01, "sms-sports-t-shirt", null, "premium", "standard", 535, 1990],
    ["LOT-B-01-S", LOT_B_01_S, "smt-men-t-shirt", 0.2, "rejected", "standard", 335, 0],
  ];

  for (const [lotName, lot, slug, weight, grade, adjustment, landed, price] of table) {
    it(`${lotName} ${slug} ${weight ?? "pc"} ${grade} -> landed ${landed}, price ${price}`, () => {
      const sc = subCategory(slug);
      const r = computePrice({
        weightKg: weight ?? 0,
        basis: lot.basis,
        effectiveRate: effectiveRate(lot),
        profileCode: sc.profileCode,
        valueIndex: sc.valueIndex,
        gradeCode: grade,
        adjustment,
      });
      assert.equal(Math.round(r.landedCost), landed);
      assert.equal(r.price, price);
    });
  }

  it("worked example: button-down at 0.31 kg lands at 519.2 and prices 1790", () => {
    const cost = landedCost({ weightKg: 0.31, effectiveRate: effectiveRate(LOT_B_01_S) });
    assert.ok(Math.abs(cost - 519.26) < 0.1, `landed ${cost}`);
    const r = computePrice({ weightKg: 0.31, effectiveRate: effectiveRate(LOT_B_01_S), profileCode: "fast", valueIndex: 1 });
    assert.equal(r.premiumPrice, 1790);
  });

  it("worked example: markdown ladder rounds to 1390 / 890 / 490", () => {
    const r = computePrice({ weightKg: 0.31, effectiveRate: effectiveRate(LOT_B_01_S), profileCode: "fast", valueIndex: 1 });
    assert.deepEqual(r.markdowns.map((m) => m.price), [1390, 890, 490]);
  });

  it("markdown depths come from settings — a 30/50/70 ladder reprices the rungs and the multiple", () => {
    const custom = { ...DEFAULT_SETTINGS, ladderDepths: [0.3, 0.5, 0.7] as [number, number, number] };
    const r = computePrice({ weightKg: 0.31, effectiveRate: effectiveRate(LOT_B_01_S), profileCode: "fast", valueIndex: 1 }, custom);
    assert.deepEqual(r.markdowns.map((m) => m.discount), [0.3, 0.5, 0.7]);
    assert.equal(r.markdowns[0].price, charm(r.price * 0.7, custom));
    assert.notEqual(profileMultiple("fast", custom).toFixed(4), profileMultiple("fast").toFixed(4));
  });

  it("grade variants derive from the rounded premium: 3190 / 1490 / 1090", () => {
    const r = computePrice({ weightKg: 0.31, effectiveRate: effectiveRate(LOT_B_01_S), profileCode: "fast", valueIndex: 1 });
    assert.equal(r.gradePrices.bnwt, 3190);
    assert.equal(r.gradePrices.excellent, 1490);
    assert.equal(r.gradePrices.very_good, 1090);
    assert.equal(r.gradePrices.rejected, 0);
  });

  it("rejected pieces price 0 with no ladder and no margin", () => {
    const r = computePrice({ weightKg: 0.2, effectiveRate: effectiveRate(LOT_B_01_S), profileCode: "fast", valueIndex: 1.1, gradeCode: "rejected" });
    assert.equal(r.price, 0);
    assert.deepEqual(r.markdowns, []);
    assert.equal(r.gpPct, 0);
    assert.ok(r.landedCost > 0, "cost is still real — it is what the reject rate measures");
  });
});

/* ------------------------------------ earlier table — planning quotes */

describe("planning quotes at the old blended rate still reproduce the earlier table", () => {
  // With no lot, the engine falls back to settings.blendedRate (6.71) and the
  // default weight — exactly the earlier cost model.
  type Row = [string, number, ProfileCode, number, number, number, number, number];
  const table: Row[] = [
    ["Men T-shirt", 0.2, "fast", 1.1, 2290, 1290, 1090, 790],
    ["Men Button-down shirt", 0.3, "fast", 1.0, 3190, 1790, 1490, 1090],
    ["Women Jeans", 0.55, "fast", 1.05, 6090, 3390, 2890, 1990],
    ["Heavy zip-up", 0.8, "standard", 0.9, 8990, 4990, 4290, 2990],
    ["Sports Bra", 0.1, "fast", 1.6, 1790, 990, 890, 590],
    ["Leather jacket", 1.8, "slow", 0.85, 21790, 12090, 10290, 7290],
  ];
  for (const [name, weightKg, profileCode, valueIndex, bnwt, premium, excellent, veryGood] of table) {
    it(`${name} -> ${bnwt}/${premium}/${excellent}/${veryGood}`, () => {
      const r = computePrice({ weightKg, profileCode, valueIndex });
      assert.equal(r.gradePrices.bnwt, bnwt);
      assert.equal(r.gradePrices.premium, premium);
      assert.equal(r.gradePrices.excellent, excellent);
      assert.equal(r.gradePrices.very_good, veryGood);
    });
  }
});

/* ------------------------------------------------------ section 4.1 — charm */

describe("charm rounding", () => {
  it("rounds to nearest, not up or down", () => {
    assert.equal(charm(1230), 1190);
    assert.equal(charm(1260), 1290);
  });

  it("never returns below the minimum price", () => {
    assert.equal(charm(0), 190);
    assert.equal(charm(50), 190);
  });

  it("every price ends in 90", () => {
    for (let v = 200; v < 25000; v += 137) assert.equal(charm(v) % 100, 90, `charm(${v})`);
  });
});

/* --------------------------------------------- sections 4.4, 4.5 — modifiers */

describe("brand tiers and adjustment", () => {
  const base = { weightKg: 0.3, profileCode: "fast" as ProfileCode, valueIndex: 1.0 };

  it("regular is the default and leaves the price unchanged", () => {
    assert.equal(computePrice(base).price, computePrice({ ...base, tier: "regular" }).price);
  });

  it("affordable luxury doubles before rounding", () => {
    assert.equal(computePrice({ ...base, tier: "affordable_luxury" }).premiumPrice, 3490);
  });

  it("ultra luxury blocks automatic pricing", () => {
    assert.match(computePrice({ ...base, tier: "ultra_luxury" }).blockReason ?? "", /manually/i);
  });

  it("above and below move the price the stated way", () => {
    const standard = computePrice({ ...base, adjustment: "standard" }).premiumPrice;
    assert.ok(computePrice({ ...base, adjustment: "above" }).premiumPrice > standard);
    assert.ok(computePrice({ ...base, adjustment: "below" }).premiumPrice < standard);
  });

  it("blended brand uplift is 1.05", () => {
    assert.equal(Number(blendedBrandUplift().toFixed(4)), 1.05);
  });
});

/* ------------------------------------------------- section 7 — expected revenue */

describe("expected revenue", () => {
  it("a rejected piece returns only bulk recovery on its cost", () => {
    assert.equal(expectedRevenue({ price: 0, landedCost: 335, gradeCode: "rejected", profileCode: "fast" }), 335 * DEFAULT_SETTINGS.bulkRecovery);
  });

  it("a sellable piece discounts for the ladder, pulls and sales tax", () => {
    // 1790 * 0.98 * (1 - 0.13875) / 1.05 + 519 * 0.02 * 0.04
    const e = expectedRevenue({ price: 1790, landedCost: 519, gradeCode: "premium", profileCode: "fast" });
    assert.equal(Number(e.toFixed(2)), Number(((1790 * 0.98 * (1 - 0.13875)) / 1.05 + 519 * 0.02 * 0.04).toFixed(2)));
  });

  it("portfolio: expected GP on a premium piece lands near the 60% target", () => {
    const price = 1790, landed = 519.26;
    const e = expectedRevenue({ price, landedCost: landed, gradeCode: "premium", profileCode: "fast" });
    const gp = (e - landed) / e;
    assert.ok(gp > 0.55 && gp < 0.7, `gp ${gp}`);
  });
});

/* ----------------------------------------------------- section 5.1 — colours */

describe("colour rotation", () => {
  it("rotates through four colours and repeats on the fifth month", () => {
    const seen = [0, 1, 2, 3, 4].map((m) => colourForMonth(new Date(2026, m, 1)));
    assert.equal(new Set(seen.slice(0, 4)).size, 4);
    assert.equal(seen[4], seen[0]);
  });

  it("maps months on floor to ladder stages, then pull", () => {
    const floored = new Date(2026, 0, 1);
    assert.equal(stageFor(floored, new Date(2026, 0, 15)), "full");
    assert.equal(stageFor(floored, new Date(2026, 1, 1)), "md1");
    assert.equal(stageFor(floored, new Date(2026, 2, 1)), "md2");
    assert.equal(stageFor(floored, new Date(2026, 3, 1)), "md3");
    assert.equal(stageFor(floored, new Date(2026, 4, 1)), "pull");
  });
});

/* ------------------------------------------------- section 8 — reference */

describe("reference data", () => {
  it("has 83 sub-categories across 14 categories", () => {
    assert.equal(SUB_CATEGORIES.length, 83);
    assert.equal(CATEGORIES.length, 14);
  });

  it("has unique slugs and unique three-letter SKU codes", () => {
    assert.equal(new Set(SUB_CATEGORIES.map((s) => s.slug)).size, SUB_CATEGORIES.length);
    for (const sc of SUB_CATEGORIES) assert.match(sc.code, /^[A-Z]{3}$/, `${sc.slug} code ${sc.code}`);
    assert.equal(new Set(SUB_CATEGORIES.map((s) => s.code)).size, SUB_CATEGORIES.length);
  });

  it("every sub-category belongs to a known category and every category has one", () => {
    const slugs = new Set(CATEGORIES.map((c) => c.slug));
    for (const sc of SUB_CATEGORIES) assert.ok(slugs.has(sc.categorySlug), `${sc.slug} -> ${sc.categorySlug}`);
    for (const c of CATEGORIES) assert.ok(SUB_CATEGORIES.some((s) => s.categorySlug === c.slug), `${c.slug} is empty`);
  });

  it("default weights and value indices are sane", () => {
    for (const sc of SUB_CATEGORIES) {
      assert.ok(sc.weightKg > 0 && sc.weightKg <= 2, `${sc.slug} weight ${sc.weightKg}`);
      assert.ok(sc.valueIndex >= 0.5 && sc.valueIndex <= 2, `${sc.slug} index ${sc.valueIndex}`);
    }
  });

  it("grade shares, rejected included, account for all intake", () => {
    assert.equal(Number(GRADES.reduce((sum, g) => sum + g.shareOfIntake, 0).toFixed(6)), 1);
    assert.equal(GRADES.find((g) => g.code === "rejected")?.shareOfIntake, DEFAULT_SETTINGS.rejectedShare);
  });

  it("each profile's ladder volumes sum to 1 and promo is zero", () => {
    for (const p of PROFILES) {
      assert.equal(Number((p.volFull + p.volPromo + p.volMd1 + p.volMd2 + p.volMd3).toFixed(6)), 1, p.code);
      assert.equal(p.volPromo, 0);
    }
  });
});
