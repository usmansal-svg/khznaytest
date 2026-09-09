/**
 * Server-only Supabase client with the service role key.
 *
 * Used by route handlers after the staff PIN session has been verified; the
 * app is the trust boundary and RLS is bypassed. Never import from a client
 * component, never expose the key as NEXT_PUBLIC_*.
 */

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

export function serviceKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

export function createServiceClient(): SupabaseClient {
  const key = serviceKey();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set on the server.");
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
