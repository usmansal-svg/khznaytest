/**
 * POST /api/pos/checkout — record a sale. Atomic in the database: every line
 * is marked sold or nothing is written. Listed garments are taken off
 * Shopify straight after (queued and retried if that fails).
 */

import { NextResponse } from "next/server";

import { requirePos } from "@/lib/pos/auth";
import { processSoldOutQueue, queueSoldOut } from "@/lib/pos/shopify-soldout";

export const instant = false;

const METHODS = ["cash", "card", "jazzcash", "easypaisa", "bank_transfer"] as const;
const STAGES = ["full", "md1", "md2", "md3"] as const;

type Body = {
  lines?: { item_id?: number; sold_price?: number; sold_stage?: string; shelf_price?: number; override_reason?: string | null }[];
  payment_method?: string; discount?: number; tendered?: number | null; payment_ref?: string | null; customer_phone?: string | null; note?: string | null;
  allow_other_outlet?: boolean;
};

export async function POST(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) return NextResponse.json({ error: "A sale needs at least one item." }, { status: 400 });
  for (const line of body.lines) {
    if (!Number.isInteger(line.item_id) || !Number.isInteger(line.sold_price) || line.sold_price! < 0) return NextResponse.json({ error: "Each line needs an item and a whole-rupee price." }, { status: 400 });
    if (!STAGES.includes(line.sold_stage as (typeof STAGES)[number])) return NextResponse.json({ error: `Bad stage: ${line.sold_stage}` }, { status: 400 });
    if (line.shelf_price != null && line.sold_price !== line.shelf_price && !line.override_reason?.trim()) return NextResponse.json({ error: "A price different from the shelf price needs a reason." }, { status: 400 });
  }
  if (!METHODS.includes(body.payment_method as (typeof METHODS)[number])) return NextResponse.json({ error: `Bad payment method: ${body.payment_method}` }, { status: 400 });
  const discount = body.discount ?? 0;
  if (!Number.isInteger(discount) || discount < 0) return NextResponse.json({ error: "Discount must be a whole, non-negative rupee amount." }, { status: 400 });
  if (body.allow_other_outlet && !gate.canManage) return NextResponse.json({ error: "Only an outlet manager can sell stock that was not received here." }, { status: 403 });

  const { db, staff, outletId } = gate;
  const { data: session } = await db.from("till_sessions").select("id").eq("outlet_id", outletId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1).maybeSingle();
  if (!session) return NextResponse.json({ error: "Open the till first (Session → Open) so cash can be reconciled." }, { status: 400 });

  const { data, error } = await db.rpc("checkout_sale", {
    p_lines: body.lines, p_payment_method: body.payment_method, p_outlet_id: outletId, p_cashier_id: staff.id, p_session_id: session.id,
    p_discount: discount, p_tendered: body.tendered ?? null, p_payment_ref: body.payment_ref || null, p_customer_phone: body.customer_phone || null, p_note: body.note || null,
    p_allow_other_outlet: Boolean(body.allow_other_outlet),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const row = Array.isArray(data) ? data[0] : data;

  // Off the website at once; anything that fails waits in the queue.
  const ids = body.lines.map((l) => l.item_id!);
  await queueSoldOut(db, ids);
  const shopify = await processSoldOutQueue(db, 10);
  return NextResponse.json({ sale: row, shopify });
}
