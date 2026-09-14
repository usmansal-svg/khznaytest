/**
 * GET   /api/admin/staff
 * POST  /api/admin/staff  { name, role, outlet_id?, pin, permissions? }
 * PATCH /api/admin/staff  { id, name?, role?, outlet_id?, active?, pin?, permissions? }
 * permissions: a list of screen keys (lib/auth/permissions.ts) that replaces the role's default; null puts the default back.
 * Managers and the founder only. PINs are never returned.
 */

import { NextResponse } from "next/server";

import { PIN_PATTERN, hashPin } from "@/lib/auth/pin";
import { requireManager } from "@/lib/auth/staff";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";

const ROLES = ["tagger", "qc_senior", "manager", "founder", "photographer", "cashier", "outlet_manager"];

/** null = role default; a list is kept to known keys; anything else is "bad". */
function cleanPermissions(v: unknown): string[] | null | "bad" {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return "bad";
  return ALL_PERMISSIONS.filter((k) => (v as string[]).includes(k));
}

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const { data, error } = await gate.db.from("staff").select("id, name, role, outlet_id, active, pin_set_at, last_login, daily_target, permissions, outlets(name)").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name: string } | null | undefined;
  return NextResponse.json({ staff: (data ?? []).map((s) => ({ ...s, outlet: one(s.outlets)?.name ?? null, outlets: undefined, has_pin: Boolean(s.pin_set_at) })) });
}

export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { name?: string; role?: string; outlet_id?: number | null; pin?: string; permissions?: string[] | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!ROLES.includes(body.role ?? "")) return NextResponse.json({ error: "Role must be one of tagger, qc_senior, manager, founder, photographer, cashier, outlet_manager." }, { status: 400 });
  if (body.role === "founder" && gate.staff.role !== "founder") return NextResponse.json({ error: "Only the founder can add a founder." }, { status: 403 });
  if (!body.pin || !PIN_PATTERN.test(body.pin)) return NextResponse.json({ error: "PIN must be 4 to 6 digits." }, { status: 400 });
  const permissions = cleanPermissions(body.permissions);
  if (permissions === "bad") return NextResponse.json({ error: "permissions must be a list of screen keys." }, { status: 400 });

  const { data, error } = await gate.db
    .from("staff")
    .insert({ name, role: body.role, outlet_id: body.outlet_id ?? null, pin_hash: hashPin(body.pin), pin_set_at: new Date().toISOString(), active: true, permissions })
    .select("id, name, role, outlet_id, active")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await gate.db.from("admin_audits").insert({ table_name: "staff", row_key: String(data.id), before: null, after: { name, role: body.role, outlet_id: body.outlet_id ?? null, permissions }, changed_by: gate.staff.id, note: "created" });
  return NextResponse.json({ staff: data });
}

export async function PATCH(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { id?: number; name?: string; role?: string; outlet_id?: number | null; active?: boolean; pin?: string; daily_target?: number | null; permissions?: string[] | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) return NextResponse.json({ error: "Bad role." }, { status: 400 });
    if (body.role === "founder" && gate.staff.role !== "founder") return NextResponse.json({ error: "Only the founder can grant founder." }, { status: 403 });
    patch.role = body.role;
  }
  if (body.outlet_id !== undefined) patch.outlet_id = body.outlet_id;
  if (body.permissions !== undefined) {
    const p = cleanPermissions(body.permissions);
    if (p === "bad") return NextResponse.json({ error: "permissions must be a list of screen keys." }, { status: 400 });
    if (body.id === gate.staff.id && p && !p.includes("settings")) return NextResponse.json({ error: "You cannot take the Settings screen away from yourself." }, { status: 400 });
    patch.permissions = p;
  }
  if (body.daily_target !== undefined) {
    if (body.daily_target != null && !(Number.isInteger(body.daily_target) && body.daily_target > 0)) return NextResponse.json({ error: "Daily target must be a whole number above 0, or empty for the default." }, { status: 400 });
    patch.daily_target = body.daily_target;
  }
  if (body.active !== undefined) {
    if (body.id === gate.staff.id && body.active === false) return NextResponse.json({ error: "You cannot deactivate yourself." }, { status: 400 });
    patch.active = body.active;
  }
  if (body.pin !== undefined) {
    if (!PIN_PATTERN.test(body.pin)) return NextResponse.json({ error: "PIN must be 4 to 6 digits." }, { status: 400 });
    patch.pin_hash = hashPin(body.pin);
    patch.pin_set_at = new Date().toISOString();
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { data: before } = await gate.db.from("staff").select("name, role, outlet_id, active, permissions").eq("id", body.id).maybeSingle();
  const { data, error } = await gate.db.from("staff").update(patch).eq("id", body.id).select("id, name, role, outlet_id, active").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { pin_hash: _p, pin_set_at: _t, ...visible } = patch; // eslint-disable-line @typescript-eslint/no-unused-vars
  await gate.db.from("admin_audits").insert({ table_name: "staff", row_key: String(body.id), before, after: { ...before, ...visible, ...(body.pin ? { pin: "reset" } : {}) }, changed_by: gate.staff.id });
  return NextResponse.json({ staff: data });
}
