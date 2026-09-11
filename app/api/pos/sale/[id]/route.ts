/** GET /api/pos/sale/[id] — one receipt in full, for reprint, returns and voids. */
import { NextResponse } from "next/server";

import { requirePos } from "@/lib/pos/auth";

export const instant = false;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const key = decodeURIComponent(id).trim();
  let q = gate.db.from("sales").select("id, receipt_no, outlet_id, sold_at, subtotal, discount, total, payment_method, tendered, change_due, payment_ref, customer_phone, note, voided_at, void_reason, staff:cashier_id(name), outlets(name), sale_items(id, item_id, list_price, shelf_price, sold_price, sold_stage, override_reason, returned_at, return_reason, refund_amount, return_disposition, items(sku, brand_text, size_label, grade_code, sub_categories(name)))");
  q = /^\d+$/.test(key) ? q.eq("id", Number(key)) : q.eq("receipt_no", key.toUpperCase());
  const { data, error } = await q.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  if (data.outlet_id !== gate.outletId && !gate.canManage) return NextResponse.json({ error: "That receipt belongs to another outlet." }, { status: 403 });
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  return NextResponse.json({
    sale: {
      ...data, staff: undefined, outlets: undefined, cashier: one<{ name: string }>(data.staff)?.name ?? null, outlet: one<{ name: string }>(data.outlets)?.name ?? null,
      lines: ((data.sale_items ?? []) as Record<string, unknown>[]).map((l) => { const it = one<{ sku: string; brand_text: string | null; size_label: string | null; grade_code: string; sub_categories: unknown }>(l.items); return { ...l, items: undefined, sku: it?.sku ?? "", brand: it?.brand_text ?? "", size_label: it?.size_label ?? null, grade: it?.grade_code ?? "", sub_category: one<{ name: string }>(it?.sub_categories)?.name ?? "" }; }),
    },
  });
}
