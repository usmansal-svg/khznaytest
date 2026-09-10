/**
 * GET  /api/admin/pricing/sheet — the whole Pricing tab as one Excel workbook:
 *      Constants, Selling profiles, Grades, Sub-categories (plus a How-to sheet).
 * POST /api/admin/pricing/sheet — multipart { file } of that workbook, edited.
 *      Returns every difference against the database, grouped the way the
 *      admin APIs take them, without writing anything. The screen lists the
 *      changes and applies them through the ordinary settings / profiles /
 *      grades / sub-categories endpoints, so validation, versioning and the
 *      audit trail are exactly what typing on the screen would give.
 *
 * Bulk edits are easier in Excel than one cell at a time on a live sheet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { requireManager } from "@/lib/admin/auth";
import { loadPricingContext } from "@/lib/pricing/repo";
import { buildPricingWorkbook, parsePricingWorkbook, SUB_SELECT, type SheetSubRow } from "@/lib/pricing/sheet";

export const instant = false;

async function loadSubRows(db: SupabaseClient) {
  const { data, error } = await db.from("sub_categories").select(SUB_SELECT).order("gender").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SheetSubRow[];
}

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const ctx = await loadPricingContext(gate.db);
  const wb = buildPricingWorkbook(ctx, await loadSubRows(gate.db));
  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(buf as ArrayBuffer, {
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="khazanay-pricing-${stamp}.xlsx"` },
  });
}

export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the workbook as a file field named 'file'." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "That file is over 5 MB — export a fresh workbook and edit that." }, { status: 400 });

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read that file. Export the workbook from here, edit it in Excel, and import that .xlsx." }, { status: 400 });
  }
  const ctx = await loadPricingContext(gate.db);
  const result = parsePricingWorkbook(wb, ctx, await loadSubRows(gate.db));
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
