/**
 * Who is making this request. Reads the PIN session cookie; if none, falls
 * back to a Supabase email login (kept for the till and for anyone who
 * prefers it). Route handlers call requireStaff() / requireManager().
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient, serviceKey } from "@/lib/supabase/service";
import { MANAGER_ROLES, SESSION_COOKIE, sessionSecret, verifySession, type StaffSession } from "./session";

export type Staff = { id: number; name: string; role: StaffSession["role"]; outlet_id: number | null };

/** The signed-in staff member, or null. */
export async function currentStaff(): Promise<Staff | null> {
  const secret = sessionSecret();
  if (secret) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const s = await verifySession(token, secret);
    if (s) return { id: s.id, name: s.name, role: s.role, outlet_id: s.outlet_id };
  }
  // Email login fallback
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await supabase.rpc("ensure_staff");
  if (!row) return null;
  const r = row as { id: number; name: string; role: StaffSession["role"]; outlet_id: number | null };
  return { id: r.id, name: r.name, role: r.role, outlet_id: r.outlet_id };
}

/**
 * The database client to act with. PIN sessions act through the service
 * client (RLS bypassed — the app checked the PIN); email sessions act as
 * themselves under RLS.
 */
export async function dbFor(staff: Staff | null): Promise<SupabaseClient> {
  if (staff && serviceKey()) return createServiceClient();
  return createClient();
}

export async function requireStaff(): Promise<{ staff: Staff; db: SupabaseClient } | { response: NextResponse }> {
  const staff = await currentStaff();
  if (!staff) return { response: NextResponse.json({ error: "Sign in with your PIN first." }, { status: 401 }) };
  return { staff, db: await dbFor(staff) };
}

export async function requireManager(): Promise<{ staff: Staff; db: SupabaseClient } | { response: NextResponse }> {
  const r = await requireStaff();
  if ("response" in r) return r;
  if (!MANAGER_ROLES.has(r.staff.role)) {
    return { response: NextResponse.json({ error: "Only managers and the founder can do this." }, { status: 403 }) };
  }
  return r;
}
