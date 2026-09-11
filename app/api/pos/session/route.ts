/**
 * GET   /api/pos/session — the open session for this outlet with running totals
 * POST  /api/pos/session { opening_float } — open the till
 * PATCH /api/pos/session { counted_cash, note? } — close it; expected cash is computed here
 */

import { NextResponse } from "next/server";

import { requirePos } from "@/lib/pos/auth";

export const instant = false;

async function totals(db: Awaited<ReturnType<typeof requirePos>> extends infer G ? (G extends { db: infer D } ? D : never) : never, sessionId: number) {
  const { data: sales } = await db.from("sales").select("id, total, payment_method, voided_at, sale_items(refund_amount, returned_at)").eq("session_id", sessionId);
  const live = (sales ?? []).filter((s) => !s.voided_at);
  const byMethod: Record<string, number> = {};
  for (const s of live) byMethod[s.payment_method] = (byMethod[s.payment_method] ?? 0) + s.total;
  const refundsCash = (sales ?? []).flatMap((s) => (s.payment_method === "cash" ? (s.sale_items as { refund_amount: number | null; returned_at: string | null }[]) : [])).filter((l) => l.returned_at && l.refund_amount).reduce((a, l) => a + (l.refund_amount ?? 0), 0);
  return { receipts: live.length, voided: (sales ?? []).length - live.length, by_method: byMethod, total: live.reduce((a, s) => a + s.total, 0), cash_refunds: refundsCash };
}

export async function GET(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  const { db, outletId } = gate;
  const { data: s } = await db.from("till_sessions").select("id, opened_at, opening_float, staff:opened_by(name)").eq("outlet_id", outletId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1).maybeSingle();
  if (!s) return NextResponse.json({ session: null });
  const t = await totals(db, s.id);
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name: string } | null | undefined;
  return NextResponse.json({ session: { id: s.id, opened_at: s.opened_at, opening_float: s.opening_float, opened_by: one(s.staff)?.name ?? null, ...t, expected_cash: s.opening_float + (t.by_method.cash ?? 0) - t.cash_refunds } });
}

export async function POST(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  let body: { opening_float?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body must be JSON." }, { status: 400 }); }
  const float = Number(body.opening_float ?? 0);
  if (!(Number.isInteger(float) && float >= 0)) return NextResponse.json({ error: "Opening float must be a whole rupee amount." }, { status: 400 });
  const { db, staff, outletId } = gate;
  const { data: open } = await db.from("till_sessions").select("id").eq("outlet_id", outletId).is("closed_at", null).limit(1).maybeSingle();
  if (open) return NextResponse.json({ error: "The till is already open." }, { status: 400 });
  const { data, error } = await db.from("till_sessions").insert({ outlet_id: outletId, opened_by: staff.id, opening_float: float }).select("id, opened_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}

export async function PATCH(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  let body: { counted_cash?: number; note?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body must be JSON." }, { status: 400 }); }
  const counted = Number(body.counted_cash);
  if (!(Number.isInteger(counted) && counted >= 0)) return NextResponse.json({ error: "Count the cash in the drawer as a whole rupee amount." }, { status: 400 });
  const { db, staff, outletId } = gate;
  const { data: s } = await db.from("till_sessions").select("id, opening_float").eq("outlet_id", outletId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1).maybeSingle();
  if (!s) return NextResponse.json({ error: "No open till." }, { status: 400 });
  const t = await totals(db, s.id);
  const expected = s.opening_float + (t.by_method.cash ?? 0) - t.cash_refunds;
  const { error } = await db.from("till_sessions").update({ closed_at: new Date().toISOString(), closed_by: staff.id, counted_cash: counted, expected_cash: expected, note: body.note?.trim() || null }).eq("id", s.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ closed: { id: s.id, expected_cash: expected, counted_cash: counted, difference: counted - expected, ...t } });
}
