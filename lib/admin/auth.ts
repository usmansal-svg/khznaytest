/**
 * Manager gate for the admin API. RLS enforces the same rule in the database
 * (is_manager()); this gives callers a clear 401/403 instead of an opaque
 * policy error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type Staff = { id: number; name: string; role: string };

export async function requireManager(supabase: SupabaseClient): Promise<{ staff: Staff } | { response: NextResponse }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { response: NextResponse.json({ error: "Sign in to change pricing." }, { status: 401 }) };
  const { data, error } = await supabase.rpc("ensure_staff");
  if (error || !data) return { response: NextResponse.json({ error: error?.message ?? "No staff record." }, { status: 500 }) };
  const staff = data as Staff;
  if (staff.role !== "manager" && staff.role !== "founder") {
    return { response: NextResponse.json({ error: "Only managers and the founder can change pricing." }, { status: 403 }) };
  }
  return { staff };
}

/** One row per change — a silently edited multiplier is very hard to find later. */
export async function audit(
  supabase: SupabaseClient,
  staffId: number,
  tableName: string,
  rowKey: string,
  before: unknown,
  after: unknown,
  note?: string,
) {
  await supabase.from("admin_audits").insert({ table_name: tableName, row_key: rowKey, before, after, changed_by: staffId, note: note ?? null });
}
