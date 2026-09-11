import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { RARE_REASONS, rareTagLine, rareWebParagraphs } from "./rare-reasons";

describe("rare find reasons", () => {
  it("every reason has a short tag line and a fuller web paragraph", () => {
    for (const r of RARE_REASONS) {
      assert.ok(r.tag.length > 10 && r.tag.length <= 70, `${r.code} tag line: ${r.tag.length} chars`);
      assert.ok(r.web.length > r.tag.length, `${r.code} web copy should be longer than the tag line`);
    }
  });

  it("the tag prints the first reason's line plus the free text, within two lines", () => {
    const line = rareTagLine(["design", "vintage"], "1990s Levi's 501");
    assert.ok(line.startsWith("Identified for its unique style and design."));
    assert.ok(line.endsWith("1990s Levi's 501"));
    assert.ok(line.length <= 120);
    assert.equal(rareTagLine(["nope"], null), "");
  });

  it("the web listing gets every reason in full, then the free text", () => {
    const paras = rareWebParagraphs(["limited", "origin"], "Numbered 12 of 200");
    assert.equal(paras.length, 3);
    assert.match(paras[0], /limited edition/i);
    assert.match(paras[1], /Italy, Japan or the USA/);
    assert.equal(paras[2], "Numbered 12 of 200");
  });
});
