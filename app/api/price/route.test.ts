/**
 * Contract test for POST /api/price — the section 13 shape. Calls the route
 * handler directly, bypassing the auth proxy, so it exercises the real glue
 * between the request body and the engine.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { POST } from "./route";

async function price(body: unknown) {
  const res = await POST(new Request("http://test/api/price", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}

describe("POST /api/price", () => {
  it("prices the worked example and returns the full ladder", async () => {
    const { status, json } = await price({ sub_category_id: "smt-men-button-down-shirt", brand_text: "Zara" });
    assert.equal(status, 200);
    assert.equal(json.price, 1790);
    assert.equal(json.landed_cost, 519.93);
    assert.equal(json.brand_tier, "regular");
    assert.deepEqual(json.markdowns.map((m: { price: number }) => m.price), [1290, 890, 390]);
    assert.equal(json.grade_prices.very_good, 1090);
    assert.ok(json.gp_pct > 0.6);
    assert.equal(json.settings_version, 1);
  });

  it("prices at the requested grade", async () => {
    const { json } = await price({ sub_category_id: "smt-men-button-down-shirt", grade: "excellent" });
    assert.equal(json.price, 1490);
  });

  it("affordable luxury resolves from the brand, never from the tagger", async () => {
    const { json } = await price({ sub_category_id: "smt-men-button-down-shirt", brand_text: "nike" });
    assert.equal(json.brand_tier, "affordable_luxury");
    assert.equal(json.brand.name, "Nike");
    assert.equal(json.price, 3490);
  });

  it("ultra luxury blocks with a reason and no price", async () => {
    const { status, json } = await price({ sub_category_id: "wmf-leather-jacket", brand_text: "Moncler" });
    assert.equal(status, 200);
    assert.equal(json.price, null);
    assert.match(json.block_reason, /manually/i);
    assert.deepEqual(json.markdowns, []);
  });

  it("rare pieces block even on a regular brand", async () => {
    const { json } = await price({ sub_category_id: "smt-men-t-shirt", brand_text: "Zara", is_rare: true });
    assert.equal(json.price, null);
    assert.match(json.block_reason, /rare/i);
  });

  it("unknown brands price as Regular and warn", async () => {
    const { json } = await price({ sub_category_id: "smt-men-t-shirt", brand_text: "Mystery Co" });
    assert.equal(json.brand_tier, "regular");
    assert.equal(json.price, 1290);
    assert.ok(json.warnings.some((w: string) => /unknown brand/i.test(w)));
  });

  it("flags high-value items for QC review", async () => {
    const { json } = await price({ sub_category_id: "wmf-leather-jacket", brand_text: "Zara" });
    assert.equal(json.price, 12090);
    assert.ok(json.warnings.some((w: string) => /QC review/i.test(w)));
  });

  it("rejects unknown sub-categories, grades and adjustments", async () => {
    assert.equal((await price({ sub_category_id: "nope" })).status, 400);
    assert.equal((await price({ sub_category_id: "smt-men-t-shirt", grade: "mint" })).status, 400);
    assert.equal((await price({ sub_category_id: "smt-men-t-shirt", adjustment: "way-up" })).status, 400);
  });

  it("rejects a non-JSON body", async () => {
    const res = await POST(new Request("http://test/api/price", { method: "POST", body: "not json" }));
    assert.equal(res.status, 400);
  });
});
