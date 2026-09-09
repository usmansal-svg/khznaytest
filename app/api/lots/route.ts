/**
 * GET   /api/lots            — every lot with its effective rate and P&L rollup
 * POST  /api/lots            — create a lot (or a child lot when parent_lot_id is given)
 * PATCH /api/lots            — { id, action: "close", kg_tagged } true-up and close
 *                              { id, action: "reopen" }
 *                              { id, rate?, provisional_yield?, supplier?, notes?, kg? } edit
 *
 * Closing a lot corrects its effective rate. Garments already tagged keep
 * their price — the difference lands in reported margin, never in repricing.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { lotPnl, type LotItem } from "@/lib/pricing/lot-pnl";
import { LOT_COLUMNS, loadPricingContext, lotFromRow, type DbLot } from "@/lib/pricing/repo";

export async function GET() {
  const supabase = await createClient();
  const ctx = await loadPricingContext(supabase);
  const [lotsRes, itemsRes] = await Promise.all([
    supabase.from("lots").select(LOT_COLUMNS).order("created_at", { ascending: false }).limit(200),
    supabase.from("items").select("lot_id, weight_kg, landed_cost, price, price_manual, grade_code, sub_category_slug, status").not("lot_id", "is", null),
  ]);
  if (lotsRes.error) return NextResponse.json({ error: lotsRes.error.message }, { status: 500 });

  const byLot = new Map<number, LotItem[]>();
  for (const it of (itemsRes.data ?? []) as LotItem[]) {
    if (!byLot.has(it.lot_id)) byLot.set(it.lot_id, []);
    byLot.get(it.lot_id)!.push(it);
  }

  const lots = (lotsRes.data ?? []).map((r) => {
    const lot = lotFromRow(r as Parameters<typeof lotFromRow>[0], ctx.settings);
    return { ...serialise(lot), pnl: lotPnl(lot, byLot.get(lot.id) ?? [], ctx.subCategories, ctx.settings, ctx.refs) };
  });
  return NextResponse.json({ lots, settings: { default_provisional_yield: ctx.settings.defaultProvisionalYield, fx: ctx.settings.fx } });
}

type CreateBody = { code?: string; supplier?: string; basis?: string; rate?: number; kg?: number | null; provisional_yield?: number | null; arrived_on?: string | null; notes?: string | null; parent_lot_id?: number | null };

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in to create lots." }, { status: 401 });

  const code = body.code?.trim().toUpperCase();
  if (!code) return bad("Lot code is required.");
  const basis = body.basis === "pc" ? "pc" : body.basis === "kg" ? "kg" : null;
  if (!basis) return bad("Basis must be kg or pc.");
  if (!(typeof body.rate === "number" && body.rate > 0)) return bad(basis === "kg" ? "Rate must be USD per kg, above 0." : "Rate must be PKR per piece, above 0.");
  if (basis === "kg" && !(typeof body.kg === "number" && body.kg > 0)) return bad("kg bought is required for kg lots.");
  if (body.provisional_yield != null && !(body.provisional_yield > 0 && body.provisional_yield <= 1)) return bad("Provisional yield must be between 0 and 1.");

  const ctx = await loadPricingContext(supabase);
  const { data, error } = await supabase
    .from("lots")
    .insert({
      code,
      supplier: body.supplier?.trim() || code,
      basis,
      rate: body.rate,
      rate_usd_per_kg: basis === "kg" ? body.rate : null,
      kg: basis === "kg" ? body.kg : null,
      provisional_yield: body.provisional_yield ?? ctx.settings.defaultProvisionalYield,
      arrived_on: body.arrived_on || null,
      notes: body.notes?.trim() || null,
      parent_lot_id: body.parent_lot_id ?? null,
    })
    .select(LOT_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ lot: serialise(lotFromRow(data as Parameters<typeof lotFromRow>[0], ctx.settings)) });
}

type PatchBody = { id?: number; action?: "close" | "reopen"; kg_tagged?: number | null; rate?: number; provisional_yield?: number; supplier?: string; notes?: string | null; kg?: number | null };

export async function PATCH(request: Request) {
  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in to change lots." }, { status: 401 });
  if (!Number.isInteger(body.id)) return bad("id is required.");

  const patch: Record<string, unknown> = {};
  if (body.action === "close") {
    if (body.kg_tagged != null && !(body.kg_tagged >= 0)) return bad("kg tagged must be zero or more.");
    patch.status = "closed";
    patch.closed_at = new Date().toISOString();
    if (body.kg_tagged != null) patch.kg_tagged = body.kg_tagged;
  } else if (body.action === "reopen") {
    patch.status = "open";
    patch.closed_at = null;
  } else {
    if ("rate" in body) {
      if (!(typeof body.rate === "number" && body.rate > 0)) return bad("Rate must be above 0.");
      patch.rate = body.rate;
    }
    if ("provisional_yield" in body) {
      if (!(typeof body.provisional_yield === "number" && body.provisional_yield > 0 && body.provisional_yield <= 1)) return bad("Provisional yield must be between 0 and 1.");
      patch.provisional_yield = body.provisional_yield;
    }
    if ("kg" in body) patch.kg = body.kg;
    if ("supplier" in body) patch.supplier = body.supplier?.trim();
    if ("notes" in body) patch.notes = body.notes?.trim() || null;
  }
  if (!Object.keys(patch).length) return bad("Nothing to change.");

  const ctx = await loadPricingContext(supabase);
  const { data, error } = await supabase.from("lots").update(patch).eq("id", body.id).select(LOT_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lot: serialise(lotFromRow(data as Parameters<typeof lotFromRow>[0], ctx.settings)) });
}

function serialise(l: DbLot) {
  return {
    id: l.id,
    code: l.code,
    supplier: l.supplier,
    basis: l.basis,
    rate: l.rate,
    kg_bought: l.kgBought,
    kg_tagged: l.kgTagged,
    provisional_yield: l.provisionalYield,
    yield: Math.round(l.yield * 10000) / 10000,
    effective_rate: l.effectiveRate == null ? null : Math.round(l.effectiveRate * 10000) / 10000,
    status: l.status,
    parent_lot_id: l.parentLotId,
    arrived_on: l.arrivedOn,
    notes: l.notes,
  };
}

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });
