/**
 * Who is at the till. Cashiers and outlet managers are tied to their outlet;
 * managers and the founder may act for any outlet by passing ?outlet=.
 */

import { NextResponse } from "next/server";

import { requireStaff, type Staff } from "@/lib/auth/staff";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PosGate = { staff: Staff; db: SupabaseClient; outletId: number; outletName: string; canManage: boolean };

export async function requirePos(request?: Request): Promise<PosGate | { response: NextResponse }> {
  const gate = await requireStaff();
  if ("response" in gate) return gate;
  const { staff, db } = gate;
  const isHq = staff.role === "manager" || staff.role === "founder";
  const allowed = isHq || staff.role === "cashier" || staff.role === "outlet_manager";
  if (!allowed) return { response: NextResponse.json({ error: "Only outlet staff and managers use the POS." }, { status: 403 }) };
  let outletId = staff.outlet_id;
  if (isHq && request) {
    const q = new URL(request.url).searchParams.get("outlet");
    if (q && Number.isInteger(Number(q))) outletId = Number(q);
  }
  if (!outletId) return { response: NextResponse.json({ error: isHq ? "Pick an outlet (?outlet=id)." : "Your account has no outlet — ask a manager to set it on Staff." }, { status: 400 }) };
  const { data: outlet } = await db.from("outlets").select("id, name").eq("id", outletId).maybeSingle();
  if (!outlet) return { response: NextResponse.json({ error: "Unknown outlet." }, { status: 400 }) };
  return { staff, db, outletId: outlet.id, outletName: outlet.name, canManage: isHq || staff.role === "outlet_manager" };
}

export const pk = (iso: string | number | Date) => new Date(new Date(iso).getTime() + 5 * 3600_000);
export function pkDayStartIso(d = new Date()): string {
  const p = pk(d);
  return new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate()) - 5 * 3600_000).toISOString();
}
