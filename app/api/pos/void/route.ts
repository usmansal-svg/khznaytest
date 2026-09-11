/** POST /api/pos/void { sale_id, reason } — void a receipt (outlet manager or HQ); lines go back on the floor. */
import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/auth";
import { requirePos } from "@/lib/pos/auth";

export const instant = false;

export async function POST(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  if (!gate.canManage) return NextResponse.json({ error: "Only an outlet manager can void a receipt." }, { status: 403 });
  let body: { sale_id?: number; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body must be JSON." }, { status: 400 }); }
  const { db, staff } = gate;
  const { data: sale } = await db.from("sales").select("id, receipt_no, outlet_id, sale_items(item_id)").eq("id", Number(body.sale_id)).maybeSingle();
  if (!sale) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  const { error } = await db.rpc("void_sale", { p_sale_id: sale.id, p_by: staff.id, p_reason: String(body.reason ?? "").trim() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // Back on the floor means back on the website too, if it was listed. Relisting is a manual step from the garment page; note it.
  await audit(db, staff.id, "sales", sale.receipt_no, null, { voided: true, reason: body.reason }, "Receipt voided");
  return NextResponse.json({ ok: true });
}
