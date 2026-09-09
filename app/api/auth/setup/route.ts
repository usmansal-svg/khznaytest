/**
 * POST /api/auth/setup { name, pin } — first-run only: creates the founder
 * and signs them in. Refuses once any PIN exists; after that managers add
 * staff from the admin page.
 */

import { NextResponse } from "next/server";

import { PIN_PATTERN, hashPin } from "@/lib/auth/pin";
import { SESSION_COOKIE, SESSION_HOURS, sessionSecret, signSession } from "@/lib/auth/session";
import { createServiceClient, serviceKey } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const secret = sessionSecret();
  if (!secret || !serviceKey()) return NextResponse.json({ error: "Server key missing." }, { status: 503 });
  let body: { name?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!body.pin || !PIN_PATTERN.test(body.pin)) return NextResponse.json({ error: "PIN must be 4 to 6 digits." }, { status: 400 });

  const db = createServiceClient();
  const { count } = await db.from("staff").select("id", { count: "exact", head: true }).not("pin_hash", "is", null);
  if ((count ?? 0) > 0) return NextResponse.json({ error: "Already set up — sign in, or ask a manager for a PIN." }, { status: 409 });

  // Reuse an existing founder row (from an email login) if there is one.
  const { data: existing } = await db.from("staff").select("id").eq("role", "founder").limit(1).maybeSingle();
  const patch = { name, role: "founder", pin_hash: hashPin(body.pin), pin_set_at: new Date().toISOString(), active: true, last_login: new Date().toISOString() };
  const { data: staff, error } = existing
    ? await db.from("staff").update(patch).eq("id", existing.id).select("id, name, role, outlet_id").single()
    : await db.from("staff").insert(patch).select("id, name, role, outlet_id").single();
  if (error || !staff) return NextResponse.json({ error: error?.message ?? "Could not create the founder." }, { status: 500 });

  const token = await signSession({ id: staff.id, name: staff.name, role: staff.role, outlet_id: staff.outlet_id }, secret);
  const res = NextResponse.json({ staff });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_HOURS * 3600 });
  return res;
}
