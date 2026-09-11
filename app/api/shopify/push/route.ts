/**
 * POST /api/shopify/push   { sku, action?: "push" | "unlist" }
 * GET  /api/shopify/push   — is Shopify configured?
 *
 * Push creates the product on first call and updates it after. Only the
 * cut-out photos are sent when any exist; originals otherwise.
 */

import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/staff";
import { createProduct, shopifyConfig, unlistProduct, updateProduct, ShopifyError } from "@/lib/shopify/client";
import { rareWebParagraphs } from "@/lib/pricing/rare-reasons";
import { shopifyTags, shopifyTitle } from "@/lib/shopify/tags";

export async function GET() {
  const cfg = shopifyConfig();
  return NextResponse.json({ configured: Boolean(cfg), domain: cfg?.domain ?? null });
}

type Photo = { url: string; kind: "original" | "cutout" };

export async function POST(request: Request) {
  let body: { sku?: string; action?: "push" | "unlist" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const sku = body.sku?.trim().toUpperCase();
  if (!sku) return NextResponse.json({ error: "sku is required." }, { status: 400 });

  const cfg = shopifyConfig();
  if (!cfg) {
    return NextResponse.json({ error: "Shopify is not connected. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in Vercel." }, { status: 503 });
  }

  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  const supabase = gate.db;

  const { data: item, error } = await supabase
    .from("items")
    .select("id, sku, brand_text, brand_tier, grade_code, is_rare, rare_reasons, rare_note, season, wearer, size_label, colour, fabric, measurements, price, price_manual, status, photos, description, shopify_product_id, sub_categories(name, categories(name))")
    .eq("sku", sku)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: `No item with SKU ${sku}.` }, { status: 404 });

  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const sub = one<{ name: string; categories: unknown }>(item.sub_categories);
  const category = one<{ name: string }>(sub?.categories)?.name ?? "";
  const subCategory = sub?.name ?? "";

  try {
    if (body.action === "unlist") {
      if (!item.shopify_product_id) return NextResponse.json({ error: "Not on Shopify yet." }, { status: 400 });
      await unlistProduct(cfg, item.shopify_product_id);
      await supabase.from("items").update({ online_status: "unlisted", shopify_synced_at: new Date().toISOString(), shopify_error: null }).eq("id", item.id);
      return NextResponse.json({ ok: true, online_status: "unlisted" });
    }

    const price = item.price_manual ?? item.price;
    if (!price) return NextResponse.json({ error: "This garment has no price to list at." }, { status: 400 });
    if (item.status === "sold" || item.status === "rejected") return NextResponse.json({ error: `Cannot list a ${item.status} garment.` }, { status: 400 });

    const photos = (item.photos ?? []) as Photo[];
    const cutouts = photos.filter((p) => p.kind === "cutout").map((p) => p.url);
    const imageUrls = cutouts.length ? cutouts : photos.map((p) => p.url);

    const taggable = {
      wearer: item.wearer, season: item.season, category, sub_category: subCategory, brand: item.brand_text, brand_tier: item.brand_tier,
      grade: item.grade_code, size_label: item.size_label, colour: item.colour, fabric: item.fabric, is_rare: item.is_rare,
    };
    const tags = shopifyTags(taggable);
    const input = {
      title: shopifyTitle(taggable),
      descriptionHtml: describe(item.description, item.measurements as Record<string, unknown>, item.grade_code, item.size_label, item.is_rare ? rareWebParagraphs((item as { rare_reasons?: string[] | null }).rare_reasons ?? [], (item as { rare_note?: string | null }).rare_note) : null),
      vendor: item.brand_text ?? "Khazanay",
      productType: subCategory,
      tags,
      sku,
      price,
      imageUrls,
      status: "ACTIVE" as const,
    };

    const result = item.shopify_product_id ? await updateProduct(cfg, item.shopify_product_id, { ...input, imageUrls: [] }) : await createProduct(cfg, input);

    await supabase
      .from("items")
      .update({ shopify_product_id: result.productId, shopify_handle: result.handle, shopify_tags: tags, shopify_synced_at: new Date().toISOString(), shopify_error: null, online_status: "listed", channel: "online" })
      .eq("id", item.id);

    return NextResponse.json({ ok: true, online_status: "listed", product_id: result.productId, handle: result.handle, admin_url: result.adminUrl, tags, created: !item.shopify_product_id });
  } catch (e) {
    const message = e instanceof ShopifyError ? e.message : e instanceof Error ? e.message : "Shopify push failed.";
    await supabase.from("items").update({ shopify_error: message }).eq("id", item.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

const GRADE_COPY: Record<string, string> = {
  bnwt: "Brand new with the original retail tags attached.",
  premium: "No faults; fabric in great shape.",
  excellent: "One minor mark or a small, tidy repair — otherwise excellent.",
  very_good: "Visibly worn-in fabric with plenty of life left.",
};

function describe(text: string | null, measurements: Record<string, unknown>, grade: string, size: string | null, rare: string[] | null = null): string {
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

function escape(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
}
