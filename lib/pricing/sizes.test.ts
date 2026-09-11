import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sizeSeriesFor, withExtras, WAIST_SIZES, LETTER_SIZES } from "./sizes";

describe("size series", () => {
  it("picks collar for button-downs, waist for bottoms, letters otherwise, age bands for kids", () => {
    assert.equal(sizeSeriesFor({ name: "Men Button-down shirt", measure_type: "top" }, [], false)[0].code, "collar");
    assert.equal(sizeSeriesFor({ name: "Men Jeans", measure_type: "bottom" }, [], false)[0].code, "waist");
    assert.equal(sizeSeriesFor({ name: "Men T-shirt", measure_type: "top" }, [], false)[0].code, "letters");
    assert.equal(sizeSeriesFor({ name: "Women Dress", measure_type: "dress" }, [], false)[1].code, "uk");
    assert.equal(sizeSeriesFor({ name: "Kids T-shirt", measure_type: "kids_top" }, ["2–3 Y"], true)[0].code, "kids");
  });

  it("extras slot in: numbers in order, XXS in front of XS, duplicates ignored", () => {
    assert.deepEqual(withExtras("waist", WAIST_SIZES, ["24", "46", "30"]).slice(0, 3), ["24", "26", "28"]);
    assert.equal(withExtras("waist", WAIST_SIZES, ["24", "46"]).at(-1), "46");
    assert.deepEqual(withExtras("letters", LETTER_SIZES, ["XXS", "5XL"]).slice(0, 2), ["XXS", "XS"]);
    assert.equal(withExtras("letters", LETTER_SIZES, ["XXS", "5XL"]).at(-1), "5XL");
    assert.equal(withExtras("letters", LETTER_SIZES, ["m"]).length, LETTER_SIZES.length);
    assert.equal(sizeSeriesFor({ name: "Men Jeans", measure_type: "bottom" }, [], false, { waist: ["24"] })[0].sizes[0], "24");
  });
});
