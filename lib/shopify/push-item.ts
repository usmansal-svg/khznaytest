/**
 * Put one garment on Shopify — or update it — with a chosen visibility:
 *   pos     active, on the Point of Sale channel only (the outlets' Shopify POS sells it; not on the website)
 *   online  active, on the Online Store only
 *   both    active, on both
 *   draft   hidden everywhere, but the product exists
 * Stock is one unit at the outlet's Shopify location when the garment is at
 * an outlet with one, else the store's first active location.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRareReasons, rareWebParagraphs } from "@/lib/pricing/rare-reasons";
import { createProduct, findProductBySku, setVisibility, shopifyConfig, ShopifyError, updateProduct, type Visibility } from "@/lib/shopify/client";
import { shopifyTags, shopifyTitle } from "@/lib/shopify/tags";

type Photo = { url: string; path: string; kind: "original" | "cutout"; source?: string; taken_at?: string };
const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
const SELECT = "id, sku, brand_text, brand_tier, grade_code, is_rare, rare_reasons, rare_note, season, wearer, size_label, colour, fabric, measurements, price, price_manual, status, channel, online_status, photos, description, shopify_product_id, shopify_visibility, outlet_id, outlets(shopify_location_id), sub_categories(name, categories(name))";

export type PushOutcome = { ok: true; sku: string; product_id: string; handle: string; admin_url: string; created: boolean; visibility: Visibility } | { ok: false; sku: string; error: string };

export async function pushItem(db: SupabaseClient, sku: string, visibility: Visibility): Promise<PushOutcome> {
  const cfg = shopifyConfig();
  if (!cfg) return { ok: false, sku, error: "Shopify is not connected. Set SHOPIFY_STORE_DOMAIN with SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Vercel." };
  const { data: item, error } = await db.from("items").select(SELECT).eq("sku", sku).maybeSingle();
  if (error) return { ok: false, sku, error: error.message };
  if (!item) return { ok: false, sku, error: "No such garment." };
  const price = item.price_manual ?? item.price;
  if (!price) return { ok: false, sku, error: "No price yet." };
  if (item.status === "sold" || item.status === "rejected" || item.status === "pulled" || item.status === "returned_damaged") return { ok: false, sku, error: `Cannot list a ${item.status.replace("_", " ")} garment.` };

  const sub = one<{ name: string; categories: unknown }>(item.sub_categories);
  const category = one<{ name: string }>(sub?.categories)?.name ?? "";
  const subCategory = sub?.name ?? "";
  const photos = (item.photos ?? []) as Photo[];
  const originals = photos.filter((p) => p.kind !== "cutout");
  const cutouts = photos.filter((p) => p.kind === "cutout");
  const cutFor = (p: Photo) => cutouts.find((c) => c.source === p.path) ?? cutouts.find((c) => !c.source && (c.taken_at ?? "") > (p.taken_at ?? "") && !originals.some((o) => (o.taken_at ?? "") > (p.taken_at ?? "") && (o.taken_at ?? "") < (c.taken_at ?? "")));
  const imageUrls = originals.length ? originals.map((p) => cutFor(p)?.url ?? p.url) : cutouts.map((c) => c.url);
  const taggable = { wearer: item.wearer, season: item.season, category, sub_category: subCategory, brand: item.brand_text, brand_tier: item.brand_tier, grade: item.grade_code, size_label: item.size_label, colour: item.colour, fabric: item.fabric, is_rare: item.is_rare };
  const tags = shopifyTags(taggable);
  const locationId = one<{ shopify_location_id: string | null }>(item.outlets)?.shopify_location_id ?? null;

  try {
    const input = {
      title: shopifyTitle(taggable),
      descriptionHtml: describe(item.description, item.measurements as Record<string, unknown>, item.grade_code, item.size_label, item.is_rare ? rareWebParagraphs((item as { rare_reasons?: string[] | null }).rare_reasons ?? [], (item as { rare_note?: string | null }).rare_note, await loadRareReasons(db)) : null),
      vendor: item.brand_text ?? "Khazanay", productType: subCategory, tags, sku, price, imageUrls,
      status: (visibility === "draft" ? "DRAFT" : "ACTIVE") as "DRAFT" | "ACTIVE", locationId,
      // No outlet location mapped: leave stock untracked so any outlet's Shopify POS can sell it; the sale takes it off Shopify.
      untracked: (visibility === "pos" || visibility === "both") && !locationId,
    };
    // Reuse a product that already exists for this SKU (a half-finished earlier upload) rather than making a second one.
    let productId = item.shopify_product_id as string | null;
    if (!productId) {
      const existing = await findProductBySku(cfg, sku);
      if (existing) { productId = existing.productId; await db.from("items").update({ shopify_product_id: existing.productId, shopify_handle: existing.handle }).eq("id", item.id); }
    }
    let result;
    if (productId) {
      try {
        result = await updateProduct(cfg, productId, { ...input, imageUrls: productId === item.shopify_product_id ? [] : imageUrls });
      } catch (e) {
        // Deleted in Shopify admin since: forget the stale ID and create it again.
        if (!(e instanceof Error && /not found|does not exist|doesn't exist|no product/i.test(e.message))) throw e;
        productId = null;
        await db.from("items").update({ shopify_product_id: null, shopify_handle: null }).eq("id", item.id);
      }
    }
    if (!productId) {
      result = await createProduct(cfg, input);
      await db.from("items").update({ shopify_product_id: result.productId, shopify_handle: result.handle }).eq("id", item.id);
    }
    if (!result) throw new ShopifyError("Shopify push produced no result.");
    await setVisibility(cfg, result.productId, visibility);
    const onWeb = visibility === "online" || visibility === "both";
    await db.from("items").update({
      shopify_product_id: result.productId, shopify_handle: result.handle, shopify_tags: tags, shopify_synced_at: new Date().toISOString(), shopify_error: null, shopify_visibility: visibility,
      online_status: onWeb ? "listed" : visibility === "draft" ? "draft" : (item.online_status ?? null) === "listed" ? "unlisted" : item.online_status,
      // A garment put on the website is online stock; POS-only stays whatever it was (usually outlet).
      ...(onWeb ? { channel: "online" } : {}),
    }).eq("id", item.id);
    return { ok: true, sku, product_id: result.productId, handle: result.handle, admin_url: result.adminUrl, created: !item.shopify_product_id, visibility };
  } catch (e) {
    const message = e instanceof ShopifyError ? e.message : e instanceof Error ? e.message : "Shopify push failed.";
    await db.from("items").update({ shopify_error: message }).eq("id", item.id);
    return { ok: false, sku, error: message };
  }
}

const GRADE_COPY: Record<string, string> = {
  bnwt: "Brand new with the original retail tags attached.",
  premium: "No faults; fabric in great shape.",
  excellent: "One small mark or a neat repair — nothing you would notice on the shelf.",
  very_good: "Fabric shows it has been worn and loved; no holes.",
};
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function describe(text: string | null, measurements: Record<string, unknown>, grade: string, size: string | null, rare: string[] | null = null): string {
  const parts: string[] = [];
  if (rare?.length) parts.push(`<p><strong>★ Rare find</strong></p>`, ...rare.map((r) => `<p>${escape(r)}</p>`));
  if (text?.trim()) parts.push(`<p>${escape(text.trim())}</p>`);
  const m = Object.entries(measurements ?? {}).filter(([, v]) => v !== "" && v != null);
  if (size || m.length) {
    parts.push(`<p><strong>Size on label:</strong> ${escape(size ?? "—")}</p>`);
    if (m.length) parts.push(`<p><strong>Measured flat (in):</strong> ${m.map(([k, v]) => `${escape(k)} ${escape(String(v))}`).join(" · ")}</p>`);
  }
  parts.push(`<p><strong>Condition:</strong> ${GRADE_COPY[grade] ?? grade}</p>`);
  parts.push(`<p>Pre-loved and hand-graded by Khazanay. One of a kind — when it's gone, it's gone.</p>`);
  return parts.join("");
}
