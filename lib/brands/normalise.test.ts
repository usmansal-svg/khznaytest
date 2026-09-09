import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { brandKey, editDistance, matchBrand, normaliseBrand } from "./normalise";

const list = [{ name: "Calvin Klein" }, { name: "Tommy Hilfiger" }, { name: "H&M" }, { name: "Levi's" }, { name: "GAP" }, { name: "Zara" }, { name: "Nike" }];

describe("brand normalisation", () => {
  it("title-cases and fixes punctuation, keeping H&M and GAP", () => {
    assert.equal(normaliseBrand("  calvin   klein "), "Calvin Klein");
    assert.equal(normaliseBrand("h&m"), "h&m"); // ampersand tokens kept as typed
    assert.equal(normaliseBrand("GAP"), "GAP");
    assert.equal(normaliseBrand("levi’s"), "Levi's");
    assert.equal(normaliseBrand("jean-paul gaultier"), "Jean-Paul Gaultier");
    assert.equal(normaliseBrand("house of fraser"), "House of Fraser");
  });

  it("keys ignore case and punctuation", () => {
    assert.equal(brandKey("H & M"), brandKey("h&m"));
    assert.equal(brandKey("Levi's"), "levis");
  });

  it("edit distance counts a transposition as one", () => {
    assert.equal(editDistance("klien", "klein"), 1);
    assert.equal(editDistance("tomy", "tommy"), 1);
  });

  it("matches exact names regardless of case and spacing", () => {
    const m = matchBrand("calvin klein", list)!;
    assert.equal(m.brand.name, "Calvin Klein");
    assert.equal(m.exact, true);
  });

  it("corrects small misspellings to the listed brand", () => {
    assert.equal(matchBrand("calvin klien", list)!.brand.name, "Calvin Klein");
    assert.equal(matchBrand("tomy hilfiger", list)!.brand.name, "Tommy Hilfiger");
    assert.equal(matchBrand("Levis", list)!.brand.name, "Levi's");
    assert.equal(matchBrand("H & M", list)!.brand.name, "H&M");
  });

  it("does not guess when nothing is close, and never on short names", () => {
    assert.equal(matchBrand("Mango", list), null);
    assert.equal(matchBrand("Nikes", list)?.brand.name, "Nike");
    assert.equal(matchBrand("Zora", list), null); // 4 letters: no fuzzy budget
  });
});
