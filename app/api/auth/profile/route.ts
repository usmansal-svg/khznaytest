/**
 * PATCH /api/auth/profile { current_pin, name?, new_pin? }
 *
 * A signed-in person changes their own display name or PIN. The current
 * PIN is required for both. The session cookie is re-signed with the new
 * name so the change shows at once.
 */

import { NextResponse } from "next/server";

import { PIN_PATTERN, hashPin, verifyPin } from "@/lib/auth/pin";
import { SESSION_COOKIE, SESSION_HOURS, sessionSecret, signSession } from "@/lib/auth/session";
import { requireStaff } from "@/lib/auth/staff";

export const instant = false;

export async function PATCH(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  let body: { current_pin?: string; name?: string; new_pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const db = gate.db;
  const { data: me } = await db.from("staff").select("id, name, role, outlet_id, pin_hash").eq("id", gate.staff.id).maybeSingle();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!verifyPin(String(body.current_pin ?? ""), me.pin_hash)) return NextResponse.json({ error: "Current PIN is wrong." }, { status: 401 });

  const patch: Record<string, unknown> = {};
  const name = body.name?.trim().replace(/\s+/g, " ");
  if (name !== undefined && name !== me.name) {
    if (name.length < 2 || name.length > 40) return NextResponse.json({ error: "Name must be 2–40 characters." }, { status: 400 });
    const { data: clash } = await db.from("staff").select("id").ilike("name", name).neq("id", me.id).maybeSingle();
    if (clash) return NextResponse.json({ error: "Someone else already uses that name." }, { status: 400 });
    patch.name = name;
  }
  if (body.new_pin) {
    if (!PIN_PATTERN.test(body.new_pin)) return NextResponse.json({ error: "New PIN must be 4–6 digits." }, { status: 400 });
    patch.pin_hash = hashPin(body.new_pin);
    patch.pin_set_at = new Date().toISOString();
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, name: me.name });
  const { error } = await db.from("staff").update(patch).eq("id", me.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("admin_audits").insert({ table_name: "staff", row_key: String(me.id), before: { name: me.name }, after: { name: patch.name ?? me.name, pin_changed: Boolean(patch.pin_hash) }, changed_by: me.id, note: "Profile changed by the person" });

  const newName = (patch.name as string | undefined) ?? me.name;
  const res = NextResponse.json({ ok: true, name: newName });
  const secret = sessionSecret();
  if (secret) {
    const token = await signSession({ id: me.id, name: newName, role: me.role, outlet_id: me.outlet_id }, secret);
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_HOURS * 3600 });
  }
  return res;
}
