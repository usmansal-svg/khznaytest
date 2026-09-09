/**
 * POST /api/pos/checkout — record a sale. The database function does the
 * work atomically: every line is marked sold or nothing is written.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const METHODS = ["cash", "card", "jazzcash", "easypaisa", "bank_transfer"] as const;
const STAGES = ["full", "md1", "md2", "md3"] as const;

type Body = {
  lines?: { item_id?: number; sold_price?: number; sold_stage?: string }[];
  payment_method?: string;
  discount?: number;
  tendered?: number | null;
  payment_ref?: string | null;
  customer_phone?: string | null;
  note?: string | null;
  outlet_id?: number | null;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "A sale needs at least one item." }, { status: 400 });
  }
  for (const line of body.lines) {
    if (!Number.isInteger(line.item_id) || !Number.isInteger(line.sold_price) || line.sold_price! < 0) {
      return NextResponse.json({ error: "Each line needs an item_id and a whole-rupee sold_price." }, { status: 400 });
    }
    if (!STAGES.includes(line.sold_stage as (typeof STAGES)[number])) {
      return NextResponse.json({ error: `Bad sold_stage: ${line.sold_stage}` }, { status: 400 });
    }
  }
  if (!METHODS.includes(body.payment_method as (typeof METHODS)[number])) {
    return NextResponse.json({ error: `Bad payment_method: ${body.payment_method}` }, { status: 400 });
  }
  const discount = body.discount ?? 0;
  if (!Number.isInteger(discount) || discount < 0) {
    return NextResponse.json({ error: "Discount must be a whole, non-negative rupee amount." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("checkout_sale", {
    p_lines: body.lines,
    p_payment_method: body.payment_method,
    p_discount: discount,
    p_tendered: body.tendered ?? null,
    p_payment_ref: body.payment_ref || null,
    p_customer_phone: body.customer_phone || null,
    p_note: body.note || null,
    p_outlet_id: body.outlet_id ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ sale: row });
}
