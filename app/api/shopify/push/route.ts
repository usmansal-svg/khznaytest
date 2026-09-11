/**
 * POST /api/shopify/push { sku, action: "push" | "unlist", visibility? }
 * One garment to Shopify (default visibility "both": website and POS), or off it.
 */

import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/staff";
import { shopifyConfig, unlistProduct, type Visibility } from "@/lib/shopify/client";
import { pushItem } from "@/lib/shopify/push-item";

export const instant = false;

const VIS = ["draft", "pos", "online", "both"];

export async function POST(request: Request) {
  let body: { sku?: string; action?: "push" | "unlist"; visibility?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const sku = body.sku?.trim().toUpperCase();
  if (!sku) return NextResponse.json({ error: "sku is required." }, { status: 400 });
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  const db = gate.db;

  if (body.action === "unlist") {
    const cfg = shopifyConfig();
    if (!cfg) return NextResponse.json({ error: "Shopify is not connected." }, { status: 503 });
    const { data: item } = await db.from("items").select("id, shopify_product_id").eq("sku", sku).maybeSingle();
    if (!item?.shopify_product_id) return NextResponse.json({ error: "Not on Shopify yet." }, { status: 400 });
    try {
      await unlistProduct(cfg, item.shopify_product_id);
      await db.from("items").update({ online_status: "unlisted", shopify_visibility: "draft", shopify_synced_at: new Date().toISOString(), shopify_error: null }).eq("id", item.id);
      return NextResponse.json({ ok: true, online_status: "unlisted" });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Shopify failed." }, { status: 502 });
    }
  }

  const visibility = (VIS.includes(String(body.visibility)) ? body.visibility : "both") as Visibility;
  const r = await pushItem(db, sku, visibility);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true, online_status: visibility === "online" || visibility === "both" ? "listed" : visibility, product_id: r.product_id, handle: r.handle, admin_url: r.admin_url, created: r.created });
}
