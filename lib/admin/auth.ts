/**
 * Manager gate for the admin API — delegates to the PIN-session helpers.
 * Kept as a module so the admin routes keep one import.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export { requireManager, requireStaff } from "@/lib/auth/staff";

/** One row per change — a silently edited multiplier is very hard to find later. */
export async function audit(db: SupabaseClient, staffId: number, tableName: string, rowKey: string, before: unknown, after: unknown, note?: string) {
  await db.from("admin_audits").insert({ table_name: tableName, row_key: rowKey, before, after, changed_by: staffId, note: note ?? null });
}
