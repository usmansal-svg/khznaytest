/**
 * Pricing engine tests — pins Part One, section 8 of the build specification.
 *
 * "Write the test suite at step 2 and keep it. The pricing chain has many
 *  multiplicative terms and a single misplaced one is invisible until margin
 *  has already leaked."
 *
 * Run with:  npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SETTINGS,
  GRADES,
  PROFILES,
  type GradeCode,
  type ProfileCode,
} from "./constants";
import {
  blendedBrandUplift,
  blendedDiscount,
  charm,
  charmDown,
  colourForMonth,
  computePrice,
  gradeSum,
  landedCost,
  profileMultiple,
  stageFor,
} from "./engine";
import { CATEGORIES, SUB_CATEGORIES, subCategory } from "./sub-categories";

/* ------------------------------------------------ section 2.2 — multiples */

describe("profile multiples", () => {
  // The three headline figures from the sell-rate profile table.
  const expected: Record<ProfileCode, number> = {
    fast: 3.3947,
    standard: 3.964,
    slow: 4.5766,
  };

  for (const p of PROFILES) {
    it(`${p.name} multiple is ${expected[p.code]}`, () => {
      assert.equal(Number(profileMultiple(p.code).toFixed(4)), expected[p.code]);
    });
  }

  it("blended discount matches the published depths", () => {
    assert.equal(Number((blendedDiscount("fast") * 100).toFixed(1)), 13.9);
    assert.equal(Number((blendedDiscount("standard") * 100).toFixed(1)), 23.9);
    assert.equal(Number((blendedDiscount("slow") * 100).toFixed(1)), 31.9);
  });

  it("grade mix term is share-weighted over sellable stock", () => {
    // (0.02*1.8 + 0.65*1.0 + 0.20*0.85 + 0.10*0.60) / 0.97
    assert.equal(Number(gradeSum().toFixed(6)), 0.94433);
  });

  it("slower profiles need a bigger multiple", () => {
    assert.ok(profileMultiple("fast") < profileMultiple("standard"));
    assert.ok(profileMultiple("standard") < profileMultiple("slow"));
  });
});

/* -------------------------------------------------- section 8 — the table */

describe("section 8 verification table", () => {
  type Row = [string, number, ProfileCode, number, number, number, number, number];

  // item, weight, profile, index, BNWT, Premium, Excellent, Very Good
  const table: Row[] = [
    ["Men T-shirt", 0.2, "fast", 1.1, 2290, 1290, 1090, 790],
    ["Men Button-down shirt", 0.3, "fast", 1.0, 3190, 1790, 1490, 1090],
    ["Women Jeans", 0.55, "fast", 1.05, 6090, 3390, 2890, 1990],
    ["Heavy zip-up", 0.8, "standard", 0.9, 8990, 4990, 4290, 2990],
    ["Sports Bra", 0.1, "fast", 1.6, 1790, 990, 890, 590],
    ["Leather jacket", 1.8, "slow", 0.85, 21790, 12090, 10290, 7290],
  ];

  for (const [name, weightKg, profileCode, valueIndex, bnwt, premium, excellent, veryGood] of table) {
    it(`${name} prices at ${bnwt}/${premium}/${excellent}/${veryGood}`, () => {
      const r = computePrice({ weightKg, profileCode, valueIndex });
      assert.deepEqual(r.gradePrices, {
        bnwt,
        premium,
        excellent,
        very_good: veryGood,
      } satisfies Record<GradeCode, number>);
    });
  }

  it("the table's weights and profiles match the reference data", () => {
    // Guards against the reference rows drifting away from the verification
    // table — the table is only meaningful if it describes real catalogue rows.
    const checks: [string, number, ProfileCode, number][] = [
      ["smt-men-t-shirt", 0.2, "fast", 1.1],
      ["smt-men-button-down-shirt", 0.3, "fast", 1.0],
      ["swb-women-jeans", 0.55, "fast", 1.05],
      ["wmf-heavy-zip-up", 0.8, "standard", 0.9],
      ["sws-sports-bra", 0.1, "fast", 1.6],
      ["wmf-leather-jacket", 1.8, "slow", 0.85],
    ];
    for (const [slug, weightKg, profileCode, valueIndex] of checks) {
      const sc = subCategory(slug);
      assert.equal(sc.weightKg, weightKg, `${slug} weight`);
      assert.equal(sc.profileCode, profileCode, `${slug} profile`);
      assert.equal(sc.valueIndex, valueIndex, `${slug} value index`);
    }
  });
});

/* ------------------------------------------ section 8 — the worked example */

describe("worked example: Men's Button-down shirt", () => {
  const inputs = { weightKg: 0.3, profileCode: "fast" as ProfileCode, valueIndex: 1.0 };

  it("lands at 519.90 (spec rounds intermediates; exact is 519.93)", () => {
    const cost = landedCost({ weightKg: 0.3 });
    assert.equal(Number(cost.toFixed(2)), 519.93);
    assert.ok(Math.abs(cost - 519.9) < 0.05);
  });

  it("recoverable input tax reduces cost by 10.8%", () => {
    assert.equal(DEFAULT_SETTINGS.inputTaxRate * DEFAULT_SETTINGS.inputTaxRecover, 0.108);
  });

  it("premium price rounds 1764.9 to 1790", () => {
    assert.equal(computePrice(inputs).premiumPrice, 1790);
  });

  it("markdown ladder is 1290 / 890 / 390", () => {
    const r = computePrice(inputs);
    assert.deepEqual(
      r.markdowns.map((m) => m.price),
      [1290, 890, 390],
    );
  });
});

/* ------------------------------------------------------ section 2.6 — charm */

describe("charm rounding", () => {
  it("rounds to nearest, not up or down", () => {
    assert.equal(charm(1230), 1190);
    assert.equal(charm(1260), 1290);
  });

  it("never returns below the minimum price", () => {
    assert.equal(charm(0), 190);
    assert.equal(charm(50), 190);
    assert.equal(charmDown(0), 190);
  });

  it("every price ends in 90", () => {
    for (let v = 200; v < 25000; v += 137) {
      assert.equal(charm(v) % 100, 90, `charm(${v})`);
      assert.equal(charmDown(v) % 100, 90, `charmDown(${v})`);
    }
  });

  it("charmDown never rounds a discount upward", () => {
    // The property that makes the ladder honest: a 25% OFF sticker is always
    // at least 25% off.
    for (let full = 290; full < 25000; full += 100) {
      for (const depth of [0.25, 0.5, 0.75]) {
        const target = full * (1 - depth);
        const price = charmDown(target);
        if (price > DEFAULT_SETTINGS.minPrice) {
          assert.ok(price <= target, `charmDown(${target}) = ${price} exceeds target`);
        }
      }
    }
  });
});

/* --------------------------------------------- sections 2.4, 2.5 — modifiers */

describe("brand tiers and adjustment", () => {
  const base = { weightKg: 0.3, profileCode: "fast" as ProfileCode, valueIndex: 1.0 };

  it("regular is the default and leaves the price unchanged", () => {
    assert.equal(computePrice(base).price, computePrice({ ...base, tier: "regular" }).price);
  });

  it("affordable luxury doubles before rounding", () => {
    // SPEC DISCREPANCY (section 8 worked example) — flagged, not resolved.
    //
    //   The example states "Aff Lux = charm(1,790 * 2.00) = 3,390". That line
    //   is not self-consistent: 1790 * 2 = 3580, which charms to 3590, and
    //   applying the brand multiplier inside charm() per the section 2 formula
    //   gives 3490. The stated 3390 is reachable only with the brand feedback
    //   toggle ON (519.93 * 3.3947 / 1.05 * 2 = 3361.9 -> 3390) — but the
    //   Premium price of 1790 in the same example requires the toggle OFF.
    //
    //   We follow the section 2 formula with the documented default (toggle
    //   off), which is what the section 8 table above is built on. Confirm
    //   which the founder intends; if the toggle should default ON, every
    //   row of the section 8 table moves, not just this one.
    assert.equal(computePrice({ ...base, tier: "affordable_luxury" }).premiumPrice, 3490);
  });

  it("ultra luxury blocks automatic pricing", () => {
    const r = computePrice({ ...base, tier: "ultra_luxury" });
    assert.match(r.blockReason ?? "", /manually/i);
  });

  it("regular and affordable luxury price automatically", () => {
    assert.equal(computePrice({ ...base, tier: "regular" }).blockReason, undefined);
    assert.equal(computePrice({ ...base, tier: "affordable_luxury" }).blockReason, undefined);
  });

  it("above and below move the price the stated way", () => {
    const standard = computePrice({ ...base, adjustment: "standard" }).premiumPrice;
    assert.ok(computePrice({ ...base, adjustment: "above" }).premiumPrice > standard);
    assert.ok(computePrice({ ...base, adjustment: "below" }).premiumPrice < standard);
  });

  it("blended brand uplift is 1.05", () => {
    assert.equal(Number(blendedBrandUplift().toFixed(4)), 1.05);
  });

  it("the feedback toggle drops everyday prices about 5%", () => {
    const off = profileMultiple("fast", DEFAULT_SETTINGS);
    const on = profileMultiple("fast", { ...DEFAULT_SETTINGS, brandFeedbackEnabled: true });
    assert.equal(Number((off / on).toFixed(4)), 1.05);
  });
});

/* ------------------------------------------------------------- gross profit */

describe("gross profit", () => {
  it("is measured on ex-tax revenue", () => {
    const r = computePrice({ weightKg: 0.3, profileCode: "fast", valueIndex: 1.0 });
    const exTax = r.price / (1 + DEFAULT_SETTINGS.salesTax);
    assert.equal(Number(r.gpPct.toFixed(6)), Number(((exTax - r.landedCost) / exTax).toFixed(6)));
  });

  it("a full-price premium piece clears the 60% target", () => {
    // Full price on a single piece sits above target: the 60% is a portfolio
    // figure, after markdowns, pulls and the grade mix drag it down.
    for (const sc of SUB_CATEGORIES) {
      const r = computePrice({
        weightKg: sc.weightKg,
        profileCode: sc.profileCode,
        valueIndex: sc.valueIndex,
      });
      assert.ok(r.gpPct > DEFAULT_SETTINGS.targetGP, `${sc.slug} gp ${r.gpPct}`);
    }
  });
});

/* -------------------------------------------------- section 3.1 — colours */

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

/* ------------------------------------------------- section 4.1 — reference */

describe("reference data", () => {
  it("has 83 sub-categories across 14 categories", () => {
    assert.equal(SUB_CATEGORIES.length, 83);
    assert.equal(CATEGORIES.length, 14);
  });

  it("has unique slugs", () => {
    assert.equal(new Set(SUB_CATEGORIES.map((s) => s.slug)).size, SUB_CATEGORIES.length);
  });

  it("every sub-category belongs to a known category", () => {
    const slugs = new Set(CATEGORIES.map((c) => c.slug));
    for (const sc of SUB_CATEGORIES) {
      assert.ok(slugs.has(sc.categorySlug), `${sc.slug} -> ${sc.categorySlug}`);
    }
  });

  it("every category has at least one sub-category", () => {
    for (const c of CATEGORIES) {
      assert.ok(
        SUB_CATEGORIES.some((s) => s.categorySlug === c.slug),
        `${c.slug} is empty`,
      );
    }
  });

  it("weights and value indices are sane", () => {
    for (const sc of SUB_CATEGORIES) {
      assert.ok(sc.weightKg > 0 && sc.weightKg <= 2, `${sc.slug} weight ${sc.weightKg}`);
      assert.ok(sc.valueIndex >= 0.5 && sc.valueIndex <= 2, `${sc.slug} index ${sc.valueIndex}`);
    }
  });

  it("grade shares plus the rejected share account for all intake", () => {
    const graded = GRADES.reduce((sum, g) => sum + g.shareOfIntake, 0);
    assert.equal(Number((graded + DEFAULT_SETTINGS.rejectedShare).toFixed(6)), 1);
  });

  it("each profile's ladder volumes sum to 1", () => {
    for (const p of PROFILES) {
      const total = p.volFull + p.volPromo + p.volMd1 + p.volMd2 + p.volMd3;
      assert.equal(Number(total.toFixed(6)), 1, `${p.code}`);
    }
  });

  it("promo is retained at zero — seasonal discounting is off", () => {
    for (const p of PROFILES) assert.equal(p.volPromo, 0);
  });
});
