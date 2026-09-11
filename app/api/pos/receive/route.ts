/**
 * GET  /api/pos/receive — transfers sent to this outlet and not yet received
 * POST /api/pos/receive { transfer_id | code } — receive one: floors every garment on it
 */
import { NextResponse } from "next/server";

import { requirePos } from "@/lib/pos/auth";
import { colourForMonth } from "@/lib/pricing/engine";

export const instant = false;

const SELECT = "id, code, status, created_at, sent_at, received_at, note, transfer_items(item_id, items(sku, brand_text, grade_code, size_label, price, price_manual, status, sub_categories(name)))";

export async function GET(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  const { data, error } = await gate.db.from("transfers").select(SELECT).eq("to_outlet_id", gate.outletId).in("status", ["sent", "open"]).order("sent_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: recent } = await gate.db.from("transfers").select("id, code, received_at, transfer_items(item_id)").eq("to_outlet_id", gate.outletId).eq("status", "received").order("received_at", { ascending: false }).limit(10);
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const shape = (t: Record<string, unknown>) => ({
    id: t.id, code: t.code, status: t.status, sent_at: t.sent_at, note: t.note,
    garments: ((t.transfer_items ?? []) as { items: unknown }[]).map((ti) => { const it = one<{ sku: string; brand_text: string | null; grade_code: string; size_label: string | null; price: number | null; price_manual: number | null; status: string; sub_categories: unknown }>(ti.items); return { sku: it?.sku, brand: it?.brand_text, grade: it?.grade_code, size: it?.size_label, price: it?.price_manual ?? it?.price ?? 0, sub_category: one<{ name: string }>(it?.sub_categories)?.name ?? "" }; }),
  });
  return NextResponse.json({ incoming: (data ?? []).map((t) => shape(t as Record<string, unknown>)), recent: (recent ?? []).map((t) => ({ id: t.id, code: t.code, received_at: t.received_at, count: (t.transfer_items ?? []).length })) });
}

export async function POST(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  let body: { transfer_id?: number; code?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body must be JSON." }, { status: 400 }); }
  const { db, staff, outletId } = gate;
  let q = db.from("transfers").select("id, code, to_outlet_id, status, transfer_items(item_id)");
  q = body.transfer_id ? q.eq("id", Number(body.transfer_id)) : q.eq("code", String(body.code ?? "").trim().toUpperCase());
  const { data: t } = await q.maybeSingle();
  if (!t) return NextResponse.json({ error: "Transfer not found." }, { status: 404 });
  if (t.to_outlet_id !== outletId) return NextResponse.json({ error: `${t.code} is for another outlet.` }, { status: 400 });
  if (t.status === "received") return NextResponse.json({ error: `${t.code} was already received.` }, { status: 400 });
  const ids = (t.transfer_items ?? []).map((x: { item_id: number }) => x.item_id);
  const now = new Date();
  const flooredOn = new Date(now.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
  if (ids.length) await db.from("items").update({ outlet_id: outletId, received_at: now.toISOString(), status: "on_floor", floored_on: flooredOn, colour_tag: colourForMonth(now) }).in("id", ids).in("status", ["tagged", "on_floor"]);
  await db.from("transfers").update({ status: "received", received_at: now.toISOString(), received_by: staff.id }).eq("id", t.id);
  return NextResponse.json({ ok: true, code: t.code, floored: ids.length, colour: colourForMonth(now) });
}
