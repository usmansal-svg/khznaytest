/** GET /api/pos/sales?from=&to=&q= — receipts for this outlet (today by default), newest first. */
import { NextResponse } from "next/server";

import { pkDayStartIso, requirePos } from "@/lib/pos/auth";

export const instant = false;

export async function GET(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")! + "T00:00:00+05:00").toISOString() : pkDayStartIso();
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")! + "T23:59:59+05:00").toISOString() : new Date(Date.now() + 86400_000).toISOString();
  const q = url.searchParams.get("q")?.trim().toUpperCase();
  let query = gate.db.from("sales").select("id, receipt_no, sold_at, subtotal, discount, total, payment_method, customer_phone, voided_at, void_reason, staff:cashier_id(name), sale_items(id, sold_price, returned_at, refund_amount, items(sku, brand_text, sub_categories(name)))").eq("outlet_id", gate.outletId).gte("sold_at", from).lte("sold_at", to).order("sold_at", { ascending: false }).limit(300);
  if (q) query = query.or(`receipt_no.ilike.%${q}%,customer_phone.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const sales = (data ?? []).map((s) => ({
    id: s.id, receipt_no: s.receipt_no, sold_at: s.sold_at, subtotal: s.subtotal, discount: s.discount, total: s.total, payment_method: s.payment_method, customer_phone: s.customer_phone,
    voided_at: s.voided_at, void_reason: s.void_reason, cashier: one<{ name: string }>(s.staff)?.name ?? null,
    lines: ((s.sale_items ?? []) as { id: number; sold_price: number; returned_at: string | null; refund_amount: number | null; items: unknown }[]).map((l) => {
      const it = one<{ sku: string; brand_text: string | null; sub_categories: unknown }>(l.items);
      return { id: l.id, sku: it?.sku ?? "", brand: it?.brand_text ?? "", sub_category: one<{ name: string }>(it?.sub_categories)?.name ?? "", sold_price: l.sold_price, returned_at: l.returned_at, refund_amount: l.refund_amount };
    }),
  }));
  const live = sales.filter((s) => !s.voided_at);
  const byMethod: Record<string, number> = {};
  for (const s of live) byMethod[s.payment_method] = (byMethod[s.payment_method] ?? 0) + s.total;
  return NextResponse.json({ sales, summary: { receipts: live.length, garments: live.reduce((a, s) => a + s.lines.filter((l) => !l.returned_at).length, 0), total: live.reduce((a, s) => a + s.total, 0), refunds: sales.reduce((a, s) => a + s.lines.reduce((b, l) => b + (l.returned_at ? l.refund_amount ?? 0 : 0), 0), 0), by_method: byMethod } });
}
