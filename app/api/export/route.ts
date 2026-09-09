/**
 * GET /api/export?what=items|transfers|lots&format=xlsx|csv&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Founder and managers. Items carry everything the tag knows plus tagger,
 * lot, outlet, shipment and received date. Dates in the file are Pakistan
 * local time.
 */

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { requireManager } from "@/lib/auth/staff";

type Cell = string | number | boolean | Date | null;
type Sheet = { name: string; columns: { header: string; key: string; width?: number }[]; rows: Record<string, Cell>[] };

const GRADE: Record<string, string> = { bnwt: "Brand New with Tags", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
const pk = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Karachi" })) : null);

export async function GET(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const db = gate.db;
  const url = new URL(request.url);
  const what = url.searchParams.get("what") ?? "items";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const fromIso = from ? new Date(`${from}T00:00:00+05:00`).toISOString() : null;
  const toIso = to ? new Date(`${to}T23:59:59.999+05:00`).toISOString() : null;

  let sheets: Sheet[];
  if (what === "items") {
    let q = db
      .from("items")
      .select("sku, tagged_at, status, channel, online_status, brand_text, brand_tier, grade_code, is_rare, is_unsure, flaw_note, season, wearer, size_label, colour, fabric, measurements, weight_kg, adjustment, colour_tag, floored_on, landed_cost, price, price_manual, settings_version, sold_at, sold_price, sold_stage, received_at, shopify_product_id, staff:tagged_by(name), lots(code, supplier), outlets(name), sub_categories(name, code, categories(name)), transfer_items(transfers(code, sent_at, received_at, status))")
      .order("tagged_at", { ascending: false })
      .limit(50000);
    if (fromIso) q = q.gte("tagged_at", fromIso);
    if (toIso) q = q.lte("tagged_at", toIso);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []).map((i) => {
      const sub = one<{ name: string; code: string; categories: unknown }>(i.sub_categories);
      const m = (i.measurements ?? {}) as Record<string, unknown>;
      const tr = (i.transfer_items as { transfers: unknown }[] | null)?.map((t) => one<{ code: string; sent_at: string | null; received_at: string | null; status: string }>(t.transfers)).filter(Boolean).at(-1) ?? null;
      return {
        sku: i.sku, tagged_at: pk(i.tagged_at), tagger: one<{ name: string }>(i.staff)?.name ?? "", lot: one<{ code: string; supplier: string }>(i.lots)?.code ?? "", supplier: one<{ code: string; supplier: string }>(i.lots)?.supplier ?? "",
        category: one<{ name: string }>(sub?.categories)?.name ?? "", sub_category: sub?.name ?? "", code: sub?.code ?? "",
        brand: i.brand_text ?? "", tier: i.brand_tier, grade: GRADE[i.grade_code] ?? i.grade_code, rare: i.is_rare, unsure: i.is_unsure, flaw: i.flaw_note ?? "",
        season: i.season ?? "", wearer: i.wearer ?? "", size: i.size_label ?? "", colour: i.colour ?? "", fabric: i.fabric ?? "",
        weight_kg: i.weight_kg == null ? null : Number(i.weight_kg), measurements: Object.entries(m).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k} ${v}`).join("; "),
        adjustment: i.adjustment, landed_cost: Number(i.landed_cost), price: i.price, price_manual: i.price_manual, list_price: i.price_manual ?? i.price,
        status: i.status, channel: i.channel, online_status: i.online_status ?? "", colour_tag: i.colour_tag ?? "", floored_on: i.floored_on ?? "",
        outlet: one<{ name: string }>(i.outlets)?.name ?? "", transfer: tr?.code ?? "", dispatched_at: pk(tr?.sent_at), received_at: pk(i.received_at ?? tr?.received_at),
        sold_at: pk(i.sold_at), sold_price: i.sold_price, sold_stage: i.sold_stage ?? "", settings_version: i.settings_version, shopify_product_id: i.shopify_product_id ?? "",
      };
    });
    sheets = [{
      name: "Items",
      columns: [
        ["sku", "SKU", 20], ["tagged_at", "Tagged at", 18], ["tagger", "Tagger", 14], ["lot", "Lot", 14], ["supplier", "Supplier", 14], ["category", "Category", 22], ["sub_category", "Sub-category", 22], ["code", "Code", 7],
        ["brand", "Brand", 16], ["tier", "Brand tier", 16], ["grade", "Grade", 18], ["rare", "Rare", 6], ["unsure", "Unsure", 7], ["flaw", "Flaw", 18], ["season", "Season", 10], ["wearer", "Wearer", 8], ["size", "Size", 8], ["colour", "Colour", 10], ["fabric", "Fabric", 10],
        ["weight_kg", "Weight kg", 10], ["measurements", "Measured flat", 26], ["adjustment", "Adjustment", 10], ["landed_cost", "Landed cost", 12], ["price", "Price", 10], ["price_manual", "Manual price", 12], ["list_price", "List price", 10],
        ["status", "Status", 10], ["channel", "Channel", 8], ["online_status", "Online status", 12], ["colour_tag", "Colour tag", 10], ["floored_on", "Floored on", 12], ["outlet", "Outlet", 12], ["transfer", "Transfer", 18], ["dispatched_at", "Dispatched", 18], ["received_at", "Received", 18],
        ["sold_at", "Sold at", 18], ["sold_price", "Sold price", 10], ["sold_stage", "Sold stage", 10], ["settings_version", "Settings v", 10], ["shopify_product_id", "Shopify ID", 26],
      ].map(([key, header, width]) => ({ key: key as string, header: header as string, width: width as number })),
      rows,
    }];
  } else if (what === "transfers") {
    const { data, error } = await db.from("transfers").select("code, status, created_at, sent_at, received_at, note, outlets!transfers_to_outlet_id_fkey(name), creator:created_by(name), receiver:received_by(name), transfer_items(items(sku, brand_text, size_label, price, price_manual, sub_categories(name)))").order("created_at", { ascending: false }).limit(2000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const shipments: Record<string, Cell>[] = [], lines: Record<string, Cell>[] = [];
    for (const t of data ?? []) {
      const items = (t.transfer_items as { items: unknown }[] | null) ?? [];
      const base = { transfer: t.code, to_outlet: one<{ name: string }>(t.outlets)?.name ?? "", status: t.status, created_by: one<{ name: string }>(t.creator)?.name ?? "", created_at: pk(t.created_at), dispatched_at: pk(t.sent_at), received_at: pk(t.received_at), received_by: one<{ name: string }>(t.receiver)?.name ?? "" };
      shipments.push({ ...base, pieces: items.length, list_value: items.reduce((s, l) => { const it = one<{ price: number | null; price_manual: number | null }>(l.items); return s + Number(it?.price_manual ?? it?.price ?? 0); }, 0), note: t.note ?? "" });
      for (const l of items) { const it = one<{ sku: string; brand_text: string | null; size_label: string | null; price: number | null; price_manual: number | null; sub_categories: unknown }>(l.items); if (it) lines.push({ transfer: t.code, to_outlet: base.to_outlet, status: t.status, dispatched_at: base.dispatched_at, received_at: base.received_at, sku: it.sku, brand: it.brand_text ?? "", sub_category: one<{ name: string }>(it.sub_categories)?.name ?? "", size: it.size_label ?? "", list_price: it.price_manual ?? it.price }); }
    }
    sheets = [
      { name: "Shipments", columns: [["transfer", "Transfer", 18], ["to_outlet", "To outlet", 12], ["status", "Status", 10], ["pieces", "Pieces", 8], ["list_value", "List value", 12], ["created_by", "Created by", 14], ["created_at", "Created", 18], ["dispatched_at", "Dispatched", 18], ["received_at", "Received", 18], ["received_by", "Received by", 14], ["note", "Note", 24]].map(([key, header, width]) => ({ key: key as string, header: header as string, width: width as number })), rows: shipments },
      { name: "Lines", columns: [["transfer", "Transfer", 18], ["to_outlet", "To outlet", 12], ["status", "Status", 10], ["dispatched_at", "Dispatched", 18], ["received_at", "Received", 18], ["sku", "SKU", 20], ["brand", "Brand", 16], ["sub_category", "Sub-category", 22], ["size", "Size", 8], ["list_price", "List price", 10]].map(([key, header, width]) => ({ key: key as string, header: header as string, width: width as number })), rows: lines },
    ];
  } else if (what === "lots") {
    const { data, error } = await db.from("lots").select("code, supplier, basis, rate, kg, kg_tagged, provisional_yield, status, arrived_on, closed_at, notes, parent:parent_lot_id(code)").order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    sheets = [{ name: "Lots", columns: [["code", "Lot", 14], ["supplier", "Supplier", 16], ["basis", "Basis", 6], ["rate", "Rate", 10], ["kg", "kg bought", 10], ["kg_tagged", "kg tagged", 10], ["provisional_yield", "Prov. yield", 10], ["status", "Status", 8], ["arrived_on", "Arrived", 12], ["closed_at", "Closed", 18], ["parent", "Split from", 14], ["notes", "Notes", 30]].map(([key, header, width]) => ({ key: key as string, header: header as string, width: width as number })),
      rows: (data ?? []).map((l) => ({ code: l.code, supplier: l.supplier, basis: l.basis, rate: l.rate == null ? null : Number(l.rate), kg: l.kg == null ? null : Number(l.kg), kg_tagged: l.kg_tagged == null ? null : Number(l.kg_tagged), provisional_yield: Number(l.provisional_yield), status: l.status, arrived_on: l.arrived_on ?? "", closed_at: pk(l.closed_at), parent: one<{ code: string }>(l.parent)?.code ?? "", notes: l.notes ?? "" })) }];
  } else {
    return NextResponse.json({ error: "what must be items, transfers or lots." }, { status: 400 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `khazanay-${what}${from || to ? `-${from ?? "start"}-to-${to ?? "today"}` : ""}-${stamp}`;

  if (format === "csv") {
    const s = sheets[0];
    const esc = (v: Cell) => { const t = v instanceof Date ? v.toISOString().replace("T", " ").slice(0, 16) : v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const csv = [s.columns.map((c) => esc(c.header)).join(","), ...s.rows.map((r) => s.columns.map((c) => esc(r[c.key] ?? null)).join(","))].join("\r\n");
    return new Response("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}.csv"` } });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Khazanay";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14 }));
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
    for (const r of s.rows) ws.addRow(r);
    for (const c of s.columns) if (/_at$/.test(c.key)) ws.getColumn(c.key).numFmt = "dd mmm yyyy hh:mm";
    for (const c of s.columns) if (/price|cost|value|rate/.test(c.key)) ws.getColumn(c.key).numFmt = "#,##0";
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${filename}.xlsx"` } });
}
