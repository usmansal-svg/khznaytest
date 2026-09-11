/** GET /api/pos/me — who is at the till, which outlet, the open session, and the outlets a manager may switch to. */
import { NextResponse } from "next/server";

import { requirePos } from "@/lib/pos/auth";

export const instant = false;

export async function GET(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  const { db, staff, outletId, outletName, canManage } = gate;
  const isHq = staff.role === "manager" || staff.role === "founder";
  const [{ data: session }, { data: outlets }] = await Promise.all([
    db.from("till_sessions").select("id, opened_at, opening_float, opened_by, staff:opened_by(name)").eq("outlet_id", outletId).is("closed_at", null).order("opened_at", { ascending: false }).limit(1).maybeSingle(),
    isHq ? db.from("outlets").select("id, name").eq("active", true).eq("is_online", false).order("id") : Promise.resolve({ data: null }),
  ]);
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name: string } | null | undefined;
  return NextResponse.json({
    staff: { id: staff.id, name: staff.name, role: staff.role },
    outlet: { id: outletId, name: outletName },
    can_manage: canManage,
    is_hq: isHq,
    outlets: outlets ?? [],
    session: session ? { id: session.id, opened_at: session.opened_at, opening_float: session.opening_float, opened_by: one(session.staff)?.name ?? null } : null,
  });
}
