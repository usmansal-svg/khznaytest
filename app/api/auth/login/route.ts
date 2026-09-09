/**
 * POST /api/auth/login { staff_id, pin } — sets the signed session cookie.
 * GET  /api/auth/login — the names to pick from, and whether setup is needed.
 */

import { NextResponse } from "next/server";

import { verifyPin } from "@/lib/auth/pin";
import { SESSION_COOKIE, SESSION_HOURS, sessionSecret, signSession } from "@/lib/auth/session";
import { createServiceClient, serviceKey } from "@/lib/supabase/service";

// Per-process brute-force brake: five wrong PINs lock a name for a minute.
const attempts = new Map<number, { n: number; until: number }>();

export async function GET() {
  if (!serviceKey()) return NextResponse.json({ error: "Server key missing.", configured: false }, { status: 503 });
  const db = createServiceClient();
  const { data, error } = await db.from("staff").select("id, name, role, outlet_id, pin_hash, active").eq("active", true).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const withPin = (data ?? []).filter((s) => s.pin_hash);
  return NextResponse.json({
    configured: true,
    needs_setup: withPin.length === 0,
    staff: withPin.map((s) => ({ id: s.id, name: s.name, role: s.role })),
  });
}

export async function POST(request: Request) {
  const secret = sessionSecret();
  if (!secret || !serviceKey()) return NextResponse.json({ error: "Server key missing." }, { status: 503 });
  let body: { staff_id?: number; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const id = Number(body.staff_id);
  if (!Number.isInteger(id) || typeof body.pin !== "string") return NextResponse.json({ error: "Pick a name and enter a PIN." }, { status: 400 });

  const a = attempts.get(id);
  if (a && a.until > Date.now()) return NextResponse.json({ error: "Too many wrong PINs — wait a minute." }, { status: 429 });

  const db = createServiceClient();
  const { data: staff } = await db.from("staff").select("id, name, role, outlet_id, pin_hash, active").eq("id", id).maybeSingle();
  if (!staff || !staff.active || !verifyPin(body.pin, staff.pin_hash)) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(id, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    return NextResponse.json({ error: "Wrong PIN." }, { status: 401 });
  }
  attempts.delete(id);
  await db.from("staff").update({ last_login: new Date().toISOString() }).eq("id", id);

  const token = await signSession({ id: staff.id, name: staff.name, role: staff.role, outlet_id: staff.outlet_id }, secret);
  const res = NextResponse.json({ staff: { id: staff.id, name: staff.name, role: staff.role, outlet_id: staff.outlet_id } });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_HOURS * 3600 });
  return res;
}
