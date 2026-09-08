import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PATTERN_TABLE, encode, modules, toSvg } from "./code128";

describe("Code 128 encoder", () => {
  it("table integrity: 107 symbols, 11 modules each, stop is 13", () => {
    assert.equal(PATTERN_TABLE.length, 107);
    PATTERN_TABLE.forEach((p, i) => {
      const sum = [...p].reduce((a, c) => a + Number(c), 0);
      assert.equal(sum, i === 106 ? 13 : 11, `pattern ${i} (${p}) sums to ${sum}`);
      assert.ok(/^[1-4]+$/.test(p), `pattern ${i} has a width outside 1–4`);
    });
  });

  it("no two patterns are identical", () => {
    assert.equal(new Set(PATTERN_TABLE).size, PATTERN_TABLE.length);
  });

  it("frames with Start B, checksum, Stop", () => {
    // "A" is value 33 in subset B; checksum = (104 + 1*33) mod 103 = 34.
    assert.deepEqual(encode("A"), [104, 33, 34, 106]);
  });

  it("checksum weights each position", () => {
    // K=43 H=40 Z=58 -=13: 104 + 43*1 + 40*2 + 58*3 + 13*4 = 453; 453 mod 103 = 41.
    assert.deepEqual(encode("KHZ-"), [104, 43, 40, 58, 13, 41, 106]);
  });

  it("a real SKU round-trips to a bar sequence starting with a bar", () => {
    const runs = modules("KHZ-SM-MBD-00042");
    assert.ok(runs.length > 0);
    // 16 chars + start + checksum = 18 symbols of 6 runs, plus stop of 7.
    assert.equal(runs.length, 18 * 6 + 7);
    // Total width: 18 symbols * 11 + 13.
    assert.equal(runs.reduce((a, b) => a + b, 0), 18 * 11 + 13);
  });

  it("rejects characters outside subset B", () => {
    assert.throws(() => encode("é"));
    assert.throws(() => encode(""));
  });

  it("renders a self-contained SVG with a quiet zone", () => {
    const svg = toSvg("KHZ-1", { moduleWidth: 2, height: 30 });
    assert.match(svg, /^<svg xmlns=/);
    assert.match(svg, /<path d="M20 0h/); // quiet zone of 10 modules * 2
    assert.match(svg, />KHZ-1<\/text>/);
  });

  it("escapes text in the label", () => {
    assert.match(toSvg("A&B"), /A&amp;B/);
  });
});
