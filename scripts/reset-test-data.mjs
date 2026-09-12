/**
 * Wipe every garment, lot and transfer (and everything hanging off them) so
 * the database starts clean before real stock. Keeps staff, PINs, pricing,
 * brands, categories, sub-categories, outlets, vendors, racks and audits.
 *
 * Run from the project root:   node scripts/reset-test-data.mjs
 * Prints what it deletes; run with --dry-run to only count.
 *
 * Shopify is not touched: garments that were uploaded are listed first so
 * they can be deleted or set to Draft in Shopify admin.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const dry = process.argv.includes("--dry-run");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: shop } = await db.from("items").select("sku, brand_text, shopify_product_id, shopify_visibility").not("shopify_product_id", "is", null);
if (shop?.length) { console.log("These garments exist as products in Shopify — delete them there (Products → search the SKU):"); for (const s of shop) console.log(`  ${s.sku}  ${s.brand_text ?? ""}  ${s.shopify_visibility ?? ""}  ${s.shopify_product_id}`); }

const wipe = async (table, filter) => {
  if (dry) { const { count } = await db.from(table).select("*", { count: "exact", head: true }); console.log(table.padEnd(28), `${count} rows`); return; }
  let q = db.from(table).delete({ count: "exact" });
  q = filter ? filter(q) : q.gte("id", 0);
  const { count, error } = await q;
  console.log(table.padEnd(28), error ? "ERR " + error.message : `${count} deleted`);
};

// Children before parents.
await wipe("sale_items"); await wipe("sales"); await wipe("till_sessions"); await wipe("shopify_sync_queue");
await wipe("qc_reviews"); await wipe("price_alerts"); await wipe("grade_audits"); await wipe("commercial_recommendations"); await wipe("replenishment_requests");
await wipe("transfer_items", (q) => q.gte("transfer_id", 0)); await wipe("transfers"); await wipe("transfer_counter", (q) => q.gte("day", "2000-01-01"));
await wipe("items"); await wipe("lot_costs");
await wipe("lots", (q) => q.not("parent_lot_id", "is", null)); await wipe("lots");
await wipe("tagger_scores", (q) => q.gte("staff_id", 0));

if (!dry) {
  await db.from("lot_counter").update({ seq: 0 }).eq("id", 1);
  await db.from("sku_counter").update({ seq: 0 }).gte("year", 2000);
  console.log("lot and SKU counters reset: next lot LOT-0001, next SKU …-00001");
  let removed = 0;
  const { data: folders } = await db.storage.from("garments").list("", { limit: 1000 });
  for (const f of folders ?? []) {
    const { data: files } = await db.storage.from("garments").list(f.name, { limit: 1000 });
    const paths = (files ?? []).map((x) => `${f.name}/${x.name}`);
    if (paths.length) { const { error } = await db.storage.from("garments").remove(paths); if (error) console.log("photos ERR", f.name, error.message); else removed += paths.length; }
  }
  console.log("photos removed", removed);
}
for (const t of ["items", "lots", "transfers"]) { const { count } = await db.from(t).select("*", { count: "exact", head: true }); console.log("now in", t.padEnd(10), count); }
