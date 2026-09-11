/** POST /api/pos/return { sale_item_id, reason, refund_amount, disposition } — return one garment from a receipt. */
import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/auth";
import { requirePos } from "@/lib/pos/auth";

export const instant = false;

export async function POST(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  let body: { sale_item_id?: number; reason?: string; refund_amount?: number; disposition?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body must be JSON." }, { status: 400 }); }
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3) return NextResponse.json({ error: "Give a reason for the return." }, { status: 400 });
  if (!Number.isInteger(body.refund_amount)) return NextResponse.json({ error: "Refund must be a whole rupee amount." }, { status: 400 });
  const { db, staff } = gate;
  const { data: line } = await db.from("sale_items").select("id, sold_price, sales(outlet_id, receipt_no), items(sku)").eq("id", Number(body.sale_item_id)).maybeSingle();
  if (!line) return NextResponse.json({ error: "Line not found." }, { status: 404 });
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const sale = one<{ outlet_id: number; receipt_no: string }>(line.sales);
  if (sale?.outlet_id !== gate.outletId && !gate.canManage) return NextResponse.json({ error: "That receipt belongs to another outlet." }, { status: 403 });
  const { error } = await db.rpc("return_sale_item", { p_sale_item_id: line.id, p_by: staff.id, p_reason: reason, p_refund: body.refund_amount, p_disposition: body.disposition === "damaged" ? "damaged" : "back_on_floor" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await audit(db, staff.id, "sale_items", String(line.id), null, { sku: one<{ sku: string }>(line.items)?.sku, receipt: sale?.receipt_no, refund: body.refund_amount, disposition: body.disposition, reason }, "Return");
  return NextResponse.json({ ok: true });
}
