import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { BRANDS, EXPECTED_BRAND_COUNT, resolveBrand, searchBrands } from "./brands";

describe("brand resolution", () => {
  it("resolves the spec's named examples to the right tier", () => {
    assert.equal(resolveBrand("Zara").tier, "regular");
    assert.equal(resolveBrand("Nike").tier, "affordable_luxury");
    assert.equal(resolveBrand("Gucci").tier, "ultra_luxury");
  });

  it("matches case-insensitively and trims", () => {
    const r = resolveBrand("  ralph lauren ");
    assert.equal(r.tier, "affordable_luxury");
    assert.equal(r.name, "Ralph Lauren");
    assert.equal(r.matched, true);
  });

  it("unknown brands default to Regular with a visible warning", () => {
    const r = resolveBrand("Some Unknown Label");
    assert.equal(r.tier, "regular");
    assert.equal(r.matched, false);
    assert.match(r.warning ?? "", /unknown brand/i);
  });

  it("an empty brand also warns rather than failing", () => {
    assert.equal(resolveBrand("").tier, "regular");
    assert.ok(resolveBrand(undefined).warning);
  });

  it("prefix search is what drives the datalist", () => {
    const names = searchBrands("ma").map((b) => b.name);
    assert.deepEqual(names.sort(), ["Mango", "Massimo Dutti", "Matalan"]);
    assert.deepEqual(searchBrands(""), []);
  });

  it("names are unique", () => {
    assert.equal(new Set(BRANDS.map((b) => b.name.toLowerCase())).size, BRANDS.length);
  });

  it("the seed is knowingly incomplete", () => {
    // Deliberately asserts the gap so nobody mistakes the seed for the full
    // list. Remove this once Khazanay_brand_tiers.csv is imported.
    assert.ok(BRANDS.length < EXPECTED_BRAND_COUNT, "brand list appears fully seeded — drop this test");
  });
});
