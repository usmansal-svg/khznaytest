/**
 * An outlet sale of a garment that is listed online must take it off the
 * website at once, or it sells twice. Tried immediately; failures wait in
 * shopify_sync_queue and are retried by the worker (/api/pos/shopify-sync).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { shopifyConfig, unlistProduct } from "@/lib/shopify/client";

export async function queueSoldOut(db: SupabaseClient, itemIds: number[]): Promise<void> {
  if (!itemIds.length) return;
  const { data } = await db.from("items").select("id, shopify_product_id, online_status").in("id", itemIds);
  const listed = (data ?? []).filter((i) => i.shopify_product_id && i.online_status === "listed");
  if (!listed.length) return;
  await db.from("shopify_sync_queue").insert(listed.map((i) => ({ item_id: i.id, action: "sold_out" })));
}

/** Work the queue: oldest first, a few at a time, each attempt recorded. Returns what happened. */
export async function processSoldOutQueue(db: SupabaseClient, limit = 20): Promise<{ done: number; failed: number; skipped: number }> {
  const cfg = shopifyConfig();
  const { data: jobs } = await db.from("shopify_sync_queue").select("id, item_id, action, attempts").is("done_at", null).lt("attempts", 10).order("created_at").limit(limit);
  let done = 0, failed = 0, skipped = 0;
  for (const job of jobs ?? []) {
    const { data: item } = await db.from("items").select("id, shopify_product_id, online_status").eq("id", job.item_id).maybeSingle();
    if (!item?.shopify_product_id) { await db.from("shopify_sync_queue").update({ done_at: new Date().toISOString(), last_error: "not on Shopify" }).eq("id", job.id); skipped++; continue; }
    if (!cfg) { await db.from("shopify_sync_queue").update({ attempts: job.attempts + 1, last_error: "Shopify is not configured (SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN)" }).eq("id", job.id); failed++; continue; }
    try {
      if (job.action === "sold_out") await unlistProduct(cfg, item.shopify_product_id);
      await db.from("items").update({ online_status: "unlisted", shopify_synced_at: new Date().toISOString(), shopify_error: null }).eq("id", item.id);
      await db.from("shopify_sync_queue").update({ done_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Shopify failed";
      await db.from("shopify_sync_queue").update({ attempts: job.attempts + 1, last_error: msg }).eq("id", job.id);
      await db.from("items").update({ shopify_error: `Sold at the outlet but still live online: ${msg}` }).eq("id", item.id);
      failed++;
    }
  }
  return { done, failed, skipped };
}
