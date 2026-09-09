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

import { currentStaff, dbFor, requireManager, requireStaff } from "@/lib/auth/staff";
import { lotPnl, type LotItem } from "@/lib/pricing/lot-pnl";
import { LOT_COLUMNS, loadPricingContext, lotFromRow, type DbLot } from "@/lib/pricing/repo";

export async function GET() {
  const supabase = await dbFor(await currentStaff());
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
  return NextResponse.json({ lots, next_code: await nextLotCode(supabase), settings: { default_provisional_yield: ctx.settings.defaultProvisionalYield, fx: ctx.settings.fx } });
}

type CreateBody = { supplier?: string; basis?: string; rate?: number; kg?: number | null; pieces?: number | null; provisional_yield?: number | null; arrived_on?: string | null; notes?: string | null; description?: string | null; imported?: boolean };

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  const supabase = gate.db;

  const basis = body.basis === "pc" ? "pc" : body.basis === "kg" ? "kg" : null;
  if (!basis) return bad("Basis must be kg or pc.");
  if (!(typeof body.rate === "number" && body.rate > 0)) return bad(basis === "kg" ? "Rate must be USD per kg, above 0." : "Rate must be PKR per piece, above 0.");
  if (basis === "kg" && !(typeof body.kg === "number" && body.kg > 0)) return bad("kg bought is required for kg lots.");
  if (basis === "pc" && body.pieces != null && !(Number.isInteger(body.pieces) && body.pieces > 0)) return bad("Pieces bought must be a whole number.");
  if (body.provisional_yield != null && !(body.provisional_yield > 0 && body.provisional_yield <= 1)) return bad("Provisional yield must be between 0 and 1.");

  const ctx = await loadPricingContext(supabase);
  // Codes are issued in strictly increasing sequence, never typed. A deleted
  // number is retired for good — reuse would make two lots share a name in
  // the history.
  const row = {
      imported: body.imported ?? true,
      supplier: body.supplier?.trim() || "Unknown vendor",
      basis,
      rate: body.rate,
      rate_usd_per_kg: basis === "kg" ? body.rate : null,
      kg: basis === "kg" ? body.kg : null,
      pieces: basis === "pc" ? body.pieces ?? null : null,
      description: body.description?.trim() || null,
      provisional_yield: body.provisional_yield ?? ctx.settings.defaultProvisionalYield,
      arrived_on: body.arrived_on || null,
      notes: body.notes?.trim() || null,
  };
  const { data: seq, error: seqErr } = await supabase.rpc("next_lot_seq");
  if (seqErr || typeof seq !== "number") return NextResponse.json({ error: `Could not number the lot: ${seqErr?.message ?? "no sequence"}` }, { status: 500 });
  const code = `LOT-${String(seq).padStart(4, "0")}`;
  const { data, error } = await supabase.from("lots").insert({ code, ...row }).select(LOT_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lot: serialise(lotFromRow(data as Parameters<typeof lotFromRow>[0], ctx.settings)) });
}

/** The number the next lot will get — the counter only ever goes up. */
async function nextLotCode(db: Awaited<ReturnType<typeof dbFor>>): Promise<string> {
  const { data } = await db.from("lot_counter").select("seq").eq("id", 1).maybeSingle();
  return `LOT-${String((data?.seq ?? 0) + 1).padStart(4, "0")}`;
}

type PatchBody = { id?: number; action?: "close" | "reopen" | "split"; imported?: boolean; kg_tagged?: number | null; piles?: { kg?: number; pieces?: number; description?: string; note?: string }[]; rate?: number; provisional_yield?: number; supplier?: string; notes?: string | null; description?: string | null; kg?: number | null; pieces?: number | null; arrived_on?: string | null };

export async function PATCH(request: Request) {
  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  const supabase = gate.db;
  if (!Number.isInteger(body.id)) return bad("id is required.");

  const patch: Record<string, unknown> = {};
  if (body.action === "close") {
    if (body.kg_tagged != null && !(body.kg_tagged >= 0)) return bad("kg tagged must be zero or more.");
    patch.status = "closed";
    patch.closed_at = new Date().toISOString();
    if (body.kg_tagged != null) patch.kg_tagged = body.kg_tagged;
  } else if (body.action === "split") {
    // Weigh each pile as it is separated; the children inherit rate and
    // yield, the parent keeps the cost and stops being taggable.
    const piles = body.piles ?? [];
    const { data: parent } = await supabase.from("lots").select(LOT_COLUMNS).eq("id", body.id).maybeSingle();
    if (!parent) return bad("No such lot.");
    if (parent.status !== "open") return bad(`Lot ${parent.code} is ${parent.status}.`);
    const byKg = parent.basis === "kg";
    const qty = (p: { kg?: number; pieces?: number }) => (byKg ? p.kg : p.pieces);
    if (!piles.length || piles.some((p) => !(typeof qty(p) === "number" && qty(p)! > 0))) return bad(byKg ? "Give the kg of each pile." : "Give the number of pieces in each pile.");
    const total = piles.reduce((s, p) => s + qty(p)!, 0);
    const bought = byKg ? Number(parent.kg ?? 0) : Number(parent.pieces ?? 0);
    if (bought && total > bought * (byKg ? 1.02 : 1)) return bad(`Piles total ${total} ${byKg ? "kg" : "pieces"} but the lot is ${bought}.`);
    const ctx = await loadPricingContext(supabase);
    const created = [];
    for (let i = 0; i < piles.length; i++) {
      const code = `${parent.code}-${String.fromCharCode(65 + i)}`;
      const { data: child, error } = await supabase
        .from("lots")
        .insert({ code, supplier: parent.supplier, basis: parent.basis, rate: parent.rate, imported: parent.imported, rate_usd_per_kg: byKg ? parent.rate : null, kg: byKg ? piles[i].kg : null, pieces: byKg ? null : piles[i].pieces, provisional_yield: parent.provisional_yield, arrived_on: parent.arrived_on, description: piles[i].description?.trim() || parent.description, notes: piles[i].note?.trim() || null, parent_lot_id: parent.id })
        .select(LOT_COLUMNS)
        .single();
      if (error) return NextResponse.json({ error: `${code}: ${error.message}` }, { status: error.code === "23505" ? 409 : 500 });
      created.push(serialise(lotFromRow(child as Parameters<typeof lotFromRow>[0], ctx.settings)));
    }
    await supabase.from("lots").update({ status: "split" }).eq("id", parent.id);
    return NextResponse.json({ children: created });
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
    if ("kg" in body) {
      if (body.kg != null && !(typeof body.kg === "number" && body.kg > 0)) return bad("kg bought must be above 0.");
      patch.kg = body.kg;
    }
    if ("pieces" in body) {
      if (body.pieces != null && !(Number.isInteger(body.pieces) && body.pieces > 0)) return bad("Pieces bought must be a whole number.");
      patch.pieces = body.pieces;
    }
    if ("supplier" in body) patch.supplier = body.supplier?.trim();
    if ("notes" in body) patch.notes = body.notes?.trim() || null;
    if ("description" in body) patch.description = body.description?.trim() || null;
    if ("arrived_on" in body) patch.arrived_on = body.arrived_on || null;
    if ("imported" in body) patch.imported = Boolean(body.imported);
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
    pieces_bought: l.pieces,
    description: l.description,
    provisional_yield: l.provisionalYield,
    yield: Math.round(l.yield * 10000) / 10000,
    effective_rate: l.effectiveRate == null ? null : Math.round(l.effectiveRate * 10000) / 10000,
    status: l.status,
    parent_lot_id: l.parentLotId,
    arrived_on: l.arrivedOn,
    notes: l.notes,
    imported: l.imported,
  };
}

/**
 * DELETE /api/lots { id, confirm: "<code>" } — managers only. Refused while
 * any garment or child pile references the lot; the caller must repeat the
 * lot code, and the screen asks twice before it gets here.
 */
export async function DELETE(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { id?: number; confirm?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Number.isInteger(body.id)) return bad("id is required.");
  const db = gate.db;
  const { data: lot } = await db.from("lots").select("id, code").eq("id", body.id).maybeSingle();
  if (!lot) return NextResponse.json({ error: "No such lot." }, { status: 404 });
  if ((body.confirm ?? "").trim().toUpperCase() !== lot.code) return bad(`Type the lot code ${lot.code} to confirm.`);
  const [{ count: items }, { count: children }] = await Promise.all([
    db.from("items").select("id", { count: "exact", head: true }).eq("lot_id", lot.id),
    db.from("lots").select("id", { count: "exact", head: true }).eq("parent_lot_id", lot.id),
  ]);
  if (items) return bad(`${lot.code} has ${items} tagged garment${items === 1 ? "" : "s"} — it cannot be deleted. Close it instead.`);
  if (children) return bad(`${lot.code} has ${children} pile${children === 1 ? "" : "s"} split from it — delete those first.`);
  const { error } = await db.from("lots").delete().eq("id", lot.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("admin_audits").insert({ table_name: "lots", row_key: lot.code, before: lot, after: null, changed_by: gate.staff.id, note: "deleted" });
  return NextResponse.json({ deleted: lot.code });
}

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });
