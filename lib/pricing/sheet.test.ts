/**
 * Excel round trip for the Pricing tab: export, edit cells the way Excel
 * would, save to bytes, load, and check that only the edits come back.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { BRAND_TIERS, DEFAULT_SETTINGS, GRADES, PROFILES, SETTINGS_VERSION } from "./constants";
import type { PricingContext } from "./repo";
import { buildPricingWorkbook, parsePricingWorkbook, type SheetSubRow } from "./sheet";
import { SUB_CATEGORIES } from "./sub-categories";

const ctx: PricingContext = {
  settings: DEFAULT_SETTINGS,
  settingsVersion: SETTINGS_VERSION,
  refs: { grades: GRADES, profiles: PROFILES, brandTiers: BRAND_TIERS },
  subCategories: [],
  source: "database",
};

const subs: SheetSubRow[] = SUB_CATEGORIES.slice(0, 6).map((s, i) => ({
  slug: s.slug, code: s.code, gender: "men", name: s.name, weight_kg: s.weightKg, profile_code: s.profileCode, value_index: s.valueIndex,
  market_ceiling: null, market_price: i === 0 ? 2500 : null, standard_cost_pkr: 600 + i * 10, active: true, categories: { name: "Tops" },
}));

async function roundTrip(edit: (wb: ExcelJS.Workbook) => void) {
  const wb = buildPricingWorkbook(ctx, subs);
  edit(wb);
  const bytes = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(bytes as ArrayBuffer);
  const r = parsePricingWorkbook(back, ctx, subs);
  if ("error" in r) throw new Error(r.error);
  return r;
}

const find = (ws: ExcelJS.Worksheet, col: number, text: string) => {
  let hit = 0;
  ws.eachRow((row, n) => { if (n > 1 && String(row.getCell(col).value) === text) hit = n; });
  assert.ok(hit, `row "${text}" not found`);
  return ws.getRow(hit);
};

describe("pricing workbook", () => {
  it("exports four editable sheets plus instructions", () => {
    const wb = buildPricingWorkbook(ctx, subs);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ["Constants", "Selling profiles", "Grades", "Sub-categories", "How to use"]);
    assert.equal(wb.getWorksheet("Sub-categories")!.rowCount, subs.length + 1);
    // Percent constants are written as percentages, ladder depths as three rows.
    const cs = wb.getWorksheet("Constants")!;
    assert.equal(find(cs, 1, "targetGP").getCell(3).value, DEFAULT_SETTINGS.targetGP * 100);
    assert.equal(find(cs, 1, "ladder2").getCell(3).value, 50);
    assert.equal(find(cs, 1, "brandFeedbackEnabled").getCell(3).value, "no");
  });

  it("an unedited workbook imports as no change", async () => {
    const r = await roundTrip(() => {});
    assert.deepEqual(r.changes, []);
    assert.deepEqual(r.problems, []);
    assert.equal(r.settings, null);
    assert.equal(r.sheetsRead, 4);
    assert.equal(r.matched, subs.length);
  });

  it("edits on every sheet come back as exactly those changes", async () => {
    const r = await roundTrip((wb) => {
      const cs = wb.getWorksheet("Constants")!;
      find(cs, 1, "targetGP").getCell(3).value = 55; // 55%
      find(cs, 1, "fx").getCell(3).value = 290;
      find(cs, 1, "ladder1").getCell(3).value = 30;
      find(cs, 1, "brandFeedbackEnabled").getCell(3).value = "yes";
      const ps = wb.getWorksheet("Selling profiles")!;
      const fast = find(ps, 1, "fast");
      fast.getCell(4).value = 60; fast.getCell(5).value = 26; // full 60, 25%-off 26 (was 62.5 / 23.5) — still 100
      const gs = wb.getWorksheet("Grades")!;
      find(gs, 1, "bnwt").getCell(3).value = 2;
      const ss = wb.getWorksheet("Sub-categories")!;
      const row = find(ss, 1, subs[1].slug);
      row.getCell(7).value = 750; // cost per piece
      row.getCell(9).value = "Slow";
      row.getCell(13).value = 3000; // market price
      row.getCell(6).value = "Winter"; // season
      const row0 = find(ss, 1, subs[0].slug);
      row0.getCell(13).value = null; // clear the market price
      row0.getCell(14).value = "no";
    });
    assert.deepEqual(r.problems, []);
    assert.ok(r.settings);
    assert.equal(r.settings!.targetGP, 0.55);
    assert.equal(r.settings!.fx, 290);
    assert.deepEqual(r.settings!.ladderDepths, [0.3, 0.5, 0.75]);
    assert.equal(r.settings!.brandFeedbackEnabled, true);
    assert.equal(r.settings!.salesTax, DEFAULT_SETTINGS.salesTax, "untouched constants stay as they were");
    assert.deepEqual(r.profileRows, [{ code: "fast", pulled_share: 0.02, vol_full: 0.6, vol_md1: 0.26, vol_md2: 0.1, vol_md3: 0.04 }]);
    assert.equal(r.gradeRows.length, GRADES.length, "grades are sent whole so shares can be re-validated");
    assert.equal(r.gradeRows.find((g) => g.code === "bnwt")!.multiplier, 2);
    assert.deepEqual(r.subRows, [
      { slug: subs[0].slug, market_price: null, active: false },
      { slug: subs[1].slug, season: "winter", standard_cost_pkr: 750, profile_code: "slow", market_price: 3000 },
    ]);
    const fields = r.changes.map((c) => `${c.sheet}/${c.row}/${c.field}`);
    assert.equal(fields.length, 13, fields.join("\n"));
    assert.ok(fields.includes("Constants/Target gross profit/%"));
    assert.ok(fields.includes(`Sub-categories/${subs[1].name}/Cost per piece`));
  });

  it("a bad value blocks the import with a readable problem, and calc columns are ignored", async () => {
    const r = await roundTrip((wb) => {
      const ss = wb.getWorksheet("Sub-categories")!;
      const row = find(ss, 1, subs[2].slug);
      row.getCell(9).value = "quick";
      row.getCell(16).value = 99999; // Premium (calc)
      const ps = wb.getWorksheet("Selling profiles")!;
      find(ps, 1, "slow").getCell(4).value = 90; // breaks the 100% sum
    });
    assert.equal(r.problems.length, 2, r.problems.join("\n"));
    assert.match(r.problems[0], /add to .*must be 100%/);
    assert.match(r.problems[1], /fast, standard or slow/);
    assert.deepEqual(r.subRows, []);
  });

  it("unknown slugs are counted and skipped; a reordered sheet still reads by header", async () => {
    const r = await roundTrip((wb) => {
      const ss = wb.getWorksheet("Sub-categories")!;
      ss.addRow({ slug: "no-such-thing", standard_cost_pkr: 1 });
      ss.spliceColumns(1, 0, ["Note", ...subs.map(() => "moved")]); // push every column right by one
    });
    assert.equal(r.unknown, 1);
    assert.equal(r.matched, subs.length);
    assert.deepEqual(r.changes, []);
  });
});
