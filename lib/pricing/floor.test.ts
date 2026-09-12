import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_SETTINGS } from "./constants";
import { sweep, type FloorItem } from "./floor";

const base = { id: 0, outlet_id: 1, sub_category: "Men T-shirt", brand: "Zara", size_label: "M", list_price: 1790, colour_tag: "red", status: "on_floor" };

describe("monthly sweep", () => {
  const asOf = new Date(2026, 8, 15); // September
  const items: FloorItem[] = [
    { ...base, id: 1, sku: "A", floored_on: "2026-09-01" }, // this month: full price
    { ...base, id: 2, sku: "B", floored_on: "2026-08-01" }, // one back: 25%
    { ...base, id: 3, sku: "C", floored_on: "2026-07-01" }, // two back: half
    { ...base, id: 4, sku: "D", floored_on: "2026-06-01" }, // three back: last chance
    { ...base, id: 5, sku: "E", floored_on: "2026-05-01" }, // four back: pull
    { ...base, id: 6, sku: "F", floored_on: null, status: "tagged" }, // not floored
  ];
  const s = sweep(items, DEFAULT_SETTINGS, asOf);

  it("stickers every on-floor garment that is one to three colours back", () => {
    assert.deepEqual(s.stickers.map((l) => [l.sku, l.sticker, l.price_today]), [["B", "25% OFF", 1390], ["C", "HALF PRICE", 890], ["D", "LAST CHANCE 75% OFF", 490]]);
  });

  it("pulls four colours back, and leaves this month's and unfloored stock alone", () => {
    assert.deepEqual(s.to_pull.map((i) => i.sku), ["E"]);
  });

  it("honours the commercials desk: a held stage beats the clock, a pull request pulls", () => {
    const decided: FloorItem[] = [
      { ...base, id: 10, sku: "H", floored_on: "2026-06-01", stage_override: "md1" }, // clock says last chance, desk says 25%
      { ...base, id: 11, sku: "K", floored_on: "2026-07-01", stage_override: "full" }, // held at full price: no sticker
      { ...base, id: 12, sku: "P", floored_on: "2026-09-01", pull_requested: true }, // this month, but pulled
    ];
    const d = sweep(decided, DEFAULT_SETTINGS, asOf);
    assert.deepEqual(d.stickers.map((l) => [l.sku, l.sticker]), [["H", "25% OFF"]]);
    assert.deepEqual(d.to_pull.map((i) => i.sku), ["P"]);
  });

  it("orders by sticker type then sub-category so the operator works in runs", () => {
    const mixed: FloorItem[] = [
      { ...base, id: 7, sku: "Z", sub_category: "Women Skirt", floored_on: "2026-08-01" },
      { ...base, id: 8, sku: "Y", sub_category: "Men Jeans", floored_on: "2026-07-01" },
      { ...base, id: 9, sku: "X", sub_category: "Men Jeans", floored_on: "2026-08-01" },
    ];
    assert.deepEqual(sweep(mixed, DEFAULT_SETTINGS, asOf).stickers.map((l) => l.sku), ["X", "Z", "Y"]);
  });
});
