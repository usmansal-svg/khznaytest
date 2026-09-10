/**
 * The Pricing tab as an Excel workbook, and back. Pure: takes the pricing
 * context and the sub-category rows, returns a workbook; takes a workbook
 * and returns the differences. The route handles auth and HTTP.
 */

import ExcelJS from "exceljs";

import type { Settings } from "@/lib/pricing/constants";
import { computePrice, profileMultiple } from "@/lib/pricing/engine";
import type { loadPricingContext } from "@/lib/pricing/repo";
import { SETTINGS_FIELDS } from "@/lib/pricing/settings-fields";

export type PricingCtx = Awaited<ReturnType<typeof loadPricingContext>>;
export type SheetSubRow = {
  slug: string; code: string; gender: string; name: string; weight_kg: number; profile_code: string; value_index: number;
  market_ceiling: number | null; market_price: number | null; standard_cost_pkr: number | null; active: boolean;
  categories: { name: string } | { name: string }[] | null;
};
export const SUB_SELECT = "slug, code, gender, name, weight_kg, profile_code, value_index, market_ceiling, market_price, standard_cost_pkr, active, categories(name, sort_order)";

const PROFILE_CODES = ["fast", "standard", "slow"];
const YELLOW = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFF8DC" } };

/* ------------------------------------------------------------ constants */

/** One row per constant. Percent-style settings (0–1) are shown as percentages so 18 means 18%. */
type ConstRow = { key: string; label: string; unit: string; pct?: boolean; kind: "number" | "yesno" };
const PCT_KEYS = new Set<keyof Settings>(["defaultProvisionalYield", "inputTaxRate", "inputTaxRecover", "salesTax", "targetGP", "rejectedShare", "bulkRecovery", "qcSampleRate"]);
const CONSTANT_ROWS: ConstRow[] = [
  ...SETTINGS_FIELDS.map((f) => ({ key: f.key, label: f.label, unit: PCT_KEYS.has(f.key) ? "%" : (f.unit ?? ""), pct: PCT_KEYS.has(f.key), kind: "number" as const })),
  { key: "ladder1", label: "Markdown 1 depth", unit: "%", pct: true, kind: "number" },
  { key: "ladder2", label: "Markdown 2 depth", unit: "%", pct: true, kind: "number" },
  { key: "ladder3", label: "Final markdown depth", unit: "%", pct: true, kind: "number" },
  { key: "compareFormulaEnabled", label: "Compare-at formula fallback on", unit: "yes/no", kind: "yesno" },
  { key: "brandFeedbackEnabled", label: "Brand feedback in the multiple (not in spec v2)", unit: "yes/no", kind: "yesno" },
];

function constantValue(s: Settings, key: string): number | boolean {
  if (key === "ladder1") return s.ladderDepths[0];
  if (key === "ladder2") return s.ladderDepths[1];
  if (key === "ladder3") return s.ladderDepths[2];
  return s[key as keyof Settings] as number | boolean;
}

/* ------------------------------------------------------- sub-categories */

const SUB_COLUMNS: { header: string; key: string; width: number; edit?: boolean }[] = [
  { header: "Slug (do not change)", key: "slug", width: 30 },
  { header: "Gender", key: "gender", width: 10 },
  { header: "Category", key: "category", width: 22 },
  { header: "Sub-category", key: "name", width: 26, edit: true },
  { header: "Code", key: "code", width: 7 },
  { header: "Cost per piece Rs (before tax)", key: "standard_cost_pkr", width: 16, edit: true },
  { header: "Profile (fast/standard/slow)", key: "profile_code", width: 14, edit: true },
  { header: "Value index", key: "value_index", width: 11, edit: true },
  { header: "Weight kg", key: "weight_kg", width: 10, edit: true },
  { header: "Market ceiling Rs", key: "market_ceiling", width: 14, edit: true },
  { header: "Market price Rs (sets Premium)", key: "market_price", width: 16, edit: true },
  { header: "Active (yes/no)", key: "active", width: 10, edit: true },
  { header: "Landed (calc)", key: "landed", width: 12 },
  { header: "Premium (calc)", key: "premium", width: 12 },
  { header: "Effective GP % (calc)", key: "effective_gp", width: 14 },
];

/* ---------------------------------------------------------------- export */

function headerRow(ws: ExcelJS.Worksheet, n: number) {
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: n } };
}
function paint(ws: ExcelJS.Worksheet, keys: string[]) {
  for (const k of keys) ws.getColumn(k).eachCell({ includeEmpty: false }, (cell, rowNo) => { if (rowNo > 1) cell.fill = YELLOW; });
}

export function buildPricingWorkbook(ctx: PricingCtx, subs: SheetSubRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Khazanay";

  // 1. Constants
  const cs = wb.addWorksheet("Constants", { views: [{ state: "frozen", ySplit: 1 }] });
  cs.columns = [
    { header: "Key (do not change)", key: "key", width: 26 },
    { header: "Constant", key: "label", width: 40 },
    { header: "Value", key: "value", width: 12 },
    { header: "Unit", key: "unit", width: 24 },
  ];
  headerRow(cs, 4);
  for (const r of CONSTANT_ROWS) {
    const v = constantValue(ctx.settings, r.key);
    cs.addRow({ key: r.key, label: r.label, value: r.kind === "yesno" ? (v ? "yes" : "no") : r.pct ? Math.round((v as number) * 10000) / 100 : v, unit: r.unit });
  }
  paint(cs, ["value"]);

  // 2. Selling profiles
  const ps = wb.addWorksheet("Selling profiles", { views: [{ state: "frozen", ySplit: 1 }] });
  ps.columns = [
    { header: "Code (do not change)", key: "code", width: 20 },
    { header: "Profile", key: "name", width: 12 },
    { header: "Never sells %", key: "pulled", width: 14 },
    { header: "Full price %", key: "full", width: 13 },
    { header: "25% off %", key: "md1", width: 11 },
    { header: "50% off %", key: "md2", width: 11 },
    { header: "75% off %", key: "md3", width: 11 },
    { header: "Multiple (calc)", key: "multiple", width: 14 },
  ];
  headerRow(ps, 8);
  for (const p of ctx.refs.profiles) {
    ps.addRow({ code: p.code, name: p.name, pulled: p.pulledShare * 100, full: p.volFull * 100, md1: p.volMd1 * 100, md2: p.volMd2 * 100, md3: p.volMd3 * 100, multiple: Math.round(profileMultiple(p.code, ctx.settings, ctx.refs) * 10000) / 10000 });
  }
  paint(ps, ["pulled", "full", "md1", "md2", "md3"]);

  // 3. Grades
  const gs = wb.addWorksheet("Grades", { views: [{ state: "frozen", ySplit: 1 }] });
  gs.columns = [
    { header: "Code (do not change)", key: "code", width: 20 },
    { header: "Grade", key: "name", width: 24 },
    { header: "× Premium", key: "multiplier", width: 12 },
    { header: "Share of intake %", key: "share", width: 16 },
  ];
  headerRow(gs, 4);
  for (const g of ctx.refs.grades) gs.addRow({ code: g.code, name: g.name, multiplier: g.multiplier, share: Math.round(g.shareOfIntake * 10000) / 100 });
  paint(gs, ["multiplier", "share"]);

  // 4. Sub-categories
  const ss = wb.addWorksheet("Sub-categories", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  ss.columns = SUB_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  headerRow(ss, SUB_COLUMNS.length);
  for (const r of subs) {
    const cat = Array.isArray(r.categories) ? r.categories[0] : r.categories;
    let landed: number | null = null, premium: number | null = null, gp: number | null = null;
    if (r.standard_cost_pkr) {
      const e = computePrice({ weightKg: 0, basis: "pc", effectiveRate: Number(r.standard_cost_pkr), imported: true, profileCode: r.profile_code as "fast", valueIndex: Number(r.value_index), premiumOverride: r.market_price == null ? undefined : Number(r.market_price) }, ctx.settings, ctx.refs);
      landed = Math.round(e.landedCost); premium = e.premiumPrice; gp = Math.round(e.effectiveGpPct * 1000) / 10;
    }
    ss.addRow({
      slug: r.slug, gender: r.gender, category: cat?.name ?? "", name: r.name, code: r.code,
      standard_cost_pkr: r.standard_cost_pkr == null ? null : Number(r.standard_cost_pkr),
      profile_code: r.profile_code, value_index: Number(r.value_index), weight_kg: Number(r.weight_kg),
      market_ceiling: r.market_ceiling == null ? null : Number(r.market_ceiling),
      market_price: r.market_price == null ? null : Number(r.market_price),
      active: r.active ? "yes" : "no", landed, premium, effective_gp: gp,
    });
  }
  paint(ss, SUB_COLUMNS.filter((c) => c.edit).map((c) => c.key));

  // 5. How to use
  const notes = wb.addWorksheet("How to use");
  notes.getColumn(1).width = 120;
  [
    "Edit the yellow cells only, on any of the four sheets, then import the file back on Pricing → Import Excel.",
    "Keep the Key / Code / Slug columns as they are: they are how rows are matched. Rows with an unknown key are ignored.",
    "Constants: percentages are written as percentages (18 means 18%). Yes/no settings take yes or no.",
    "Selling profiles: full + 25% off + 50% off + 75% off must add to 100. Never sells is on top.",
    "Grades: Premium stays at 1 and Rejected at 0; the five intake shares must add to 100.",
    "Sub-categories: cost per piece is what you pay before sales tax, duty included. Leave a cost, ceiling or market price blank to clear it. Profile is fast, standard or slow; Active is yes or no.",
    "Columns marked (calc) are for reference and are ignored on import. Every change is listed on screen before anything is saved; settings save as a new version, and every edit is audited under your name.",
  ].forEach((t) => notes.addRow([t]));

  return wb;
}

/* ---------------------------------------------------------------- import */

export type Change = { sheet: string; row: string; field: string; from: string | number | boolean | null; to: string | number | boolean | null };

const cellText = (row: ExcelJS.Row, col: number | undefined): string | null => {
  if (!col) return null;
  const v = row.getCell(col).value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v) return String((v as { result: unknown }).result ?? "");
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
    return String(v);
  }
  return String(v);
};
const num = (s: string): number | null | "bad" => {
  const t = s.replace(/[,\s%]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : "bad";
};
const yesno = (s: string): boolean | null => {
  const a = s.trim().toLowerCase();
  return ["yes", "y", "true", "1", "on"].includes(a) ? true : ["no", "n", "false", "0", "off"].includes(a) ? false : null;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Column index by header text, so a reordered sheet still imports. */
function headers(ws: ExcelJS.Worksheet, wanted: { header: string; key: string }[]) {
  const idx = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = String(cell.value ?? "").trim().toLowerCase();
    const m = wanted.find((c) => c.header.toLowerCase() === h);
    if (m) idx.set(m.key, col);
  });
  return idx;
}

export type PricingImport = {
  settings: Settings | null;
  profileRows: { code: string; pulled_share: number; vol_full: number; vol_md1: number; vol_md2: number; vol_md3: number }[];
  gradeRows: { code: string; multiplier: number; share_of_intake: number }[];
  subRows: Record<string, unknown>[];
  changes: Change[];
  problems: string[];
  matched: number;
  unknown: number;
  sheetsRead: number;
};

export function parsePricingWorkbook(wb: ExcelJS.Workbook, ctx: PricingCtx, subs: SheetSubRow[]): PricingImport | { error: string } {
  const changes: Change[] = [];
  const problems: string[] = [];
  let sheetsRead = 0;

  // ---- Constants
  let settings: Settings | null = null;
  const cs = wb.getWorksheet("Constants");
  if (cs) {
    sheetsRead++;
    const idx = headers(cs, [{ header: "Key (do not change)", key: "key" }, { header: "Value", key: "value" }]);
    if (!idx.has("key") || !idx.has("value")) problems.push("Constants: the Key and Value columns are missing.");
    else {
      const next: Settings = { ...ctx.settings, ladderDepths: [...ctx.settings.ladderDepths] as [number, number, number] };
      let touched = false;
      cs.eachRow((row, rowNo) => {
        if (rowNo === 1) return;
        const key = (cellText(row, idx.get("key")) ?? "").trim();
        const def = CONSTANT_ROWS.find((c) => c.key === key);
        if (!def) return;
        const text = (cellText(row, idx.get("value")) ?? "").trim();
        if (text === "") return;
        const was = constantValue(ctx.settings, key);
        if (def.kind === "yesno") {
          const to = yesno(text);
          if (to == null) { problems.push(`Constants: "${def.label}" must be yes or no.`); return; }
          if (to !== was) { (next as unknown as Record<string, unknown>)[key] = to; touched = true; changes.push({ sheet: "Constants", row: def.label, field: "Value", from: was as boolean, to }); }
          return;
        }
        const n = num(text);
        if (n === "bad") { problems.push(`Constants: "${def.label}" value "${text}" is not a number.`); return; }
        if (n == null) return;
        const to = def.pct ? r4(n / 100) : n;
        if (near(to, was as number)) return;
        touched = true;
        if (key === "ladder1") next.ladderDepths[0] = to;
        else if (key === "ladder2") next.ladderDepths[1] = to;
        else if (key === "ladder3") next.ladderDepths[2] = to;
        else (next as unknown as Record<string, unknown>)[key] = to;
        changes.push({ sheet: "Constants", row: def.label, field: def.unit || "Value", from: def.pct ? r4((was as number) * 100) : (was as number), to: def.pct ? n : to });
      });
      if (touched) settings = next;
    }
  }

  // ---- Selling profiles
  const profileRows: { code: string; pulled_share: number; vol_full: number; vol_md1: number; vol_md2: number; vol_md3: number }[] = [];
  const ps = wb.getWorksheet("Selling profiles");
  if (ps) {
    sheetsRead++;
    const idx = headers(ps, [{ header: "Code (do not change)", key: "code" }, { header: "Never sells %", key: "pulled" }, { header: "Full price %", key: "full" }, { header: "25% off %", key: "md1" }, { header: "50% off %", key: "md2" }, { header: "75% off %", key: "md3" }]);
    if (!idx.has("code")) problems.push("Selling profiles: the Code column is missing.");
    else ps.eachRow((row, rowNo) => {
      if (rowNo === 1) return;
      const code = (cellText(row, idx.get("code")) ?? "").trim().toLowerCase();
      const p = ctx.refs.profiles.find((x) => x.code === code);
      if (!p) return;
      const vals: Record<string, number> = { pulled: p.pulledShare, full: p.volFull, md1: p.volMd1, md2: p.volMd2, md3: p.volMd3 };
      const labels: Record<string, string> = { pulled: "Never sells %", full: "Full price %", md1: "25% off %", md2: "50% off %", md3: "75% off %" };
      let touched = false;
      for (const k of Object.keys(vals)) {
        const text = (cellText(row, idx.get(k)) ?? "").trim();
        if (text === "") continue;
        const n = num(text);
        if (n === "bad") { problems.push(`Selling profiles: ${p.name} ${labels[k]} "${text}" is not a number.`); continue; }
        if (n == null) continue;
        const to = r4(n / 100);
        if (near(to, vals[k])) continue;
        changes.push({ sheet: "Selling profiles", row: p.name, field: labels[k], from: r4(vals[k] * 100), to: n });
        vals[k] = to; touched = true;
      }
      if (touched) profileRows.push({ code, pulled_share: vals.pulled, vol_full: vals.full, vol_md1: vals.md1, vol_md2: vals.md2, vol_md3: vals.md3 });
    });
    for (const r of profileRows) {
      const sum = r.vol_full + r.vol_md1 + r.vol_md2 + r.vol_md3;
      if (Math.abs(sum - 1) > 0.0005) problems.push(`Selling profiles: ${r.code} full + 25% + 50% + 75% add to ${r4(sum * 100)}%, must be 100%.`);
    }
  }

  // ---- Grades
  const gradeRows: { code: string; multiplier: number; share_of_intake: number }[] = [];
  const gs = wb.getWorksheet("Grades");
  if (gs) {
    sheetsRead++;
    const idx = headers(gs, [{ header: "Code (do not change)", key: "code" }, { header: "× Premium", key: "multiplier" }, { header: "Share of intake %", key: "share" }]);
    if (!idx.has("code")) problems.push("Grades: the Code column is missing.");
    else {
      const merged = ctx.refs.grades.map((g) => ({ code: g.code, name: g.name, multiplier: g.multiplier, share: g.shareOfIntake }));
      let touched = false;
      gs.eachRow((row, rowNo) => {
        if (rowNo === 1) return;
        const code = (cellText(row, idx.get("code")) ?? "").trim().toLowerCase();
        const g = merged.find((x) => x.code === code);
        if (!g) return;
        const mText = (cellText(row, idx.get("multiplier")) ?? "").trim();
        const sText = (cellText(row, idx.get("share")) ?? "").trim();
        if (mText !== "") {
          const n = num(mText);
          if (n === "bad") problems.push(`Grades: ${g.name} multiplier "${mText}" is not a number.`);
          else if (n != null && !near(n, g.multiplier)) { changes.push({ sheet: "Grades", row: g.name, field: "× Premium", from: g.multiplier, to: n }); g.multiplier = n; touched = true; }
        }
        if (sText !== "") {
          const n = num(sText);
          if (n === "bad") problems.push(`Grades: ${g.name} share "${sText}" is not a number.`);
          else if (n != null && !near(r4(n / 100), g.share)) { changes.push({ sheet: "Grades", row: g.name, field: "Share of intake %", from: r4(g.share * 100), to: n }); g.share = r4(n / 100); touched = true; }
        }
      });
      if (touched) {
        if (merged.find((g) => g.code === "premium")?.multiplier !== 1) problems.push("Grades: Premium must stay at 1.");
        if (merged.find((g) => g.code === "rejected")?.multiplier !== 0) problems.push("Grades: Rejected must stay at 0.");
        const sum = merged.reduce((s, g) => s + g.share, 0);
        if (Math.abs(sum - 1) > 0.0005) problems.push(`Grades: intake shares add to ${r4(sum * 100)}%, must be 100%.`);
        for (const g of merged) gradeRows.push({ code: g.code, multiplier: g.multiplier, share_of_intake: g.share });
      }
    }
  }

  // ---- Sub-categories
  const subRows: Record<string, unknown>[] = [];
  let matched = 0, unknown = 0;
  const ss = wb.getWorksheet("Sub-categories");
  if (ss) {
    sheetsRead++;
    const idx = headers(ss, SUB_COLUMNS);
    if (!idx.has("slug")) problems.push("Sub-categories: the Slug column is missing.");
    else {
      const bySlug = new Map(subs.map((r) => [r.slug, r]));
      ss.eachRow((row, rowNo) => {
        if (rowNo === 1) return;
        const slug = (cellText(row, idx.get("slug")) ?? "").trim();
        if (!slug) return;
        const before = bySlug.get(slug);
        if (!before) { unknown++; return; }
        matched++;
        const patch: Record<string, unknown> = {};
        const note = (field: string, from: Change["from"], to: Change["to"]) => changes.push({ sheet: "Sub-categories", row: before.name, field, from, to });
        for (const c of SUB_COLUMNS.filter((c) => c.edit)) {
          const raw = cellText(row, idx.get(c.key));
          if (raw == null) continue;
          const text = raw.trim();
          switch (c.key) {
            case "name":
              if (text && text !== before.name) { patch.name = text; note("Sub-category", before.name, text); }
              break;
            case "profile_code": {
              const p = text.toLowerCase();
              if (!p) break;
              if (!PROFILE_CODES.includes(p)) { problems.push(`Sub-categories row ${rowNo} (${before.name}): profile "${text}" must be fast, standard or slow.`); break; }
              if (p !== before.profile_code) { patch.profile_code = p; note("Profile", before.profile_code, p); }
              break;
            }
            case "active": {
              if (!text) break;
              const to = yesno(text);
              if (to == null) { problems.push(`Sub-categories row ${rowNo} (${before.name}): active "${text}" must be yes or no.`); break; }
              if (to !== before.active) { patch.active = to; note("Active", before.active, to); }
              break;
            }
            case "value_index":
            case "weight_kg": {
              const n = num(text);
              if (n === "bad") { problems.push(`Sub-categories row ${rowNo} (${before.name}): "${text}" is not a number.`); break; }
              if (n == null) break;
              const was = Number(before[c.key]);
              if (!near(n, was)) { patch[c.key] = n; note(c.key === "weight_kg" ? "Weight kg" : "Value index", was, n); }
              break;
            }
            case "standard_cost_pkr":
            case "market_ceiling":
            case "market_price": {
              const n = num(text);
              if (n === "bad") { problems.push(`Sub-categories row ${rowNo} (${before.name}): "${text}" is not a number.`); break; }
              const was = before[c.key] == null ? null : Number(before[c.key]);
              const label = c.key === "standard_cost_pkr" ? "Cost per piece" : c.key === "market_ceiling" ? "Market ceiling" : "Market price";
              if (n == null && was == null) break;
              if (n == null || was == null || !near(n, was)) { patch[c.key] = n; note(label, was, n); }
              break;
            }
          }
        }
        if (Object.keys(patch).length) subRows.push({ slug, ...patch });
      });
    }
  }

  if (!sheetsRead) return { error: "None of the four sheets (Constants, Selling profiles, Grades, Sub-categories) were found. Export the workbook from here and edit that." };

  return { settings, profileRows, gradeRows, subRows, changes, problems, matched, unknown, sheetsRead };
}
