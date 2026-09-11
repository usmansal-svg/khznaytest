import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { garmentType, shopifyTags, shopifyTitle } from "./tags";

const hoodie = {
  wearer: "men", season: "winter", category: "Winter Men Fashion", sub_category: "Heavy hoodie",
  brand: "Nike", brand_tier: "affordable_luxury", grade: "premium", size_label: "L", colour: "black", fabric: "Cotton", is_rare: false,
};

describe("Shopify tags", () => {
  it("emits the collection tag Men Hoodie plus every filterable attribute", () => {
    const tags = shopifyTags(hoodie);
    assert.deepEqual(tags, ["Men", "Heavy Hoodie", "Men Heavy Hoodie", "Winter", "Winter Heavy Hoodie", "Winter Men Heavy Hoodie", "Nike", "Affordable Luxury", "Size L", "Premium", "Black", "Cotton"]);
  });

  it("strips the wearer prefix from the reference sub-category name", () => {
    assert.equal(garmentType("Men T-shirt"), "T-shirt");
    assert.equal(garmentType("Women Sports Hoodie"), "Sports Hoodie");
    assert.equal(garmentType("Kids Jacket"), "Jacket");
    assert.equal(garmentType("Heavy hoodie"), "Heavy hoodie");
  });

  it("kids garments get both the wearer and a Kids collection tag", () => {
    const tags = shopifyTags({ ...hoodie, wearer: "girl", category: "Children Winter", sub_category: "Kids Hoodie", size_label: "4–5 Y" });
    assert.ok(tags.includes("Girls"));
    assert.ok(tags.includes("Kids"));
    assert.ok(tags.includes("Girls Hoodie"));
    assert.ok(tags.includes("Kids Hoodie"));
  });

  it("never emits duplicates and skips empty fields", () => {
    const tags = shopifyTags({ ...hoodie, brand: null, brand_tier: "regular", colour: null, fabric: null, size_label: null });
    assert.equal(new Set(tags.map((t) => t.toLowerCase())).size, tags.length);
    assert.ok(!tags.some((t) => /size/i.test(t)));
    assert.ok(!tags.includes("Regular"));
  });

  it("marks sportswear and rare finds", () => {
    assert.ok(shopifyTags({ ...hoodie, category: "Winter Men Sports", sub_category: "Sports Hoodie" }).includes("Sportswear"));
    assert.ok(shopifyTags({ ...hoodie, is_rare: true }).includes("Rare Find"));
  });

  it("builds a readable product title", () => {
    assert.equal(shopifyTitle(hoodie), "Nike Heavy Hoodie — Men, Size L");
    assert.equal(shopifyTitle({ ...hoodie, brand: null, size_label: null }), "Unbranded Heavy Hoodie — Men");
  });
});
