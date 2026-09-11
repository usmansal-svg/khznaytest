/**
 * POST /api/shopify/webhook — Shopify calls this when an order is paid
 * (topic orders/paid; orders/create also works). Each line's SKU is one of
 * ours, so the garment is marked sold here with the price paid and the
 * markdown stage it was at, whether the sale was on the website or on a
 * Shopify POS at an outlet.
 *
 * Verified with SHOPIFY_WEBHOOK_SECRET (the signing secret shown when the
 * webhook is created in Shopify admin → Settings → Notifications → Webhooks).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { stageFor } from "@/lib/pricing/engine";
import { createServiceClient } from "@/lib/supabase/service";

export const instant = false;

export async function POST(request: Request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const raw = await request.text();
  if (!secret) return NextResponse.json({ error: "SHOPIFY_WEBHOOK_SECRET is not set." }, { status: 503 });
  const given = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  const ok = given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) {
    // Recorded so a mis-pasted secret shows up as "refused" in the audit log rather than silence.
    await createServiceClient().from("admin_audits").insert({ table_name: "shopify_webhook", row_key: "refused", before: null, after: { topic: request.headers.get("x-shopify-topic"), shop: request.headers.get("x-shopify-shop-domain"), has_signature: Boolean(given), body_bytes: raw.length }, changed_by: null, note: "Shopify webhook refused: signature did not match SHOPIFY_WEBHOOK_SECRET" });
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  let order: { id?: number; name?: string; created_at?: string; financial_status?: string; location_id?: number | null; source_name?: string; line_items?: { sku?: string | null; price?: string; quantity?: number }[] };
  try { order = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON." }, { status: 400 }); }
  const topic = request.headers.get("x-shopify-topic") ?? "";
  if (topic.startsWith("orders/") && order.financial_status && !["paid", "partially_paid", "authorized"].includes(order.financial_status)) return NextResponse.json({ ok: true, skipped: order.financial_status });

  const db = createServiceClient();
  // Every verified call is recorded, test notifications included, so delivery can be checked without server logs.
  const skusOnOrder = (order.line_items ?? []).map((l) => l.sku?.trim().toUpperCase()).filter((x): x is string => Boolean(x));
  await db.from("admin_audits").insert({ table_name: "shopify_webhook", row_key: String(order.name ?? order.id ?? "test"), before: null, after: { topic, source: order.source_name ?? null, financial_status: order.financial_status ?? null, lines: skusOnOrder.length, skus: skusOnOrder.slice(0, 20) }, changed_by: null, note: `Shopify webhook received (${request.headers.get("x-shopify-shop-domain") ?? "unknown shop"})` });
  const soldAt = order.created_at ?? new Date().toISOString();
  const via = order.source_name === "pos" ? "shopify_pos" : "shopify_web";
  const done: string[] = [];
  for (const line of order.line_items ?? []) {
    const sku = line.sku?.trim().toUpperCase();
    if (!sku || !/^KHZ-/.test(sku)) continue;
    const { data: item } = await db.from("items").select("id, status, floored_on, price, price_manual").eq("sku", sku).maybeSingle();
    if (!item || item.status === "sold") continue;
    const stage = item.floored_on ? stageFor(new Date(item.floored_on), new Date(soldAt)) : "full";
    await db.from("items").update({
      status: "sold", sold_at: soldAt, sold_price: Math.round(Number(line.price ?? item.price_manual ?? item.price ?? 0)), sold_stage: stage === "pull" ? "md3" : stage,
      online_status: "unlisted", shopify_synced_at: new Date().toISOString(), shopify_error: null,
    }).eq("id", item.id);
    await db.from("admin_audits").insert({ table_name: "items", row_key: sku, before: { status: item.status }, after: { status: "sold", via, order: order.name ?? order.id }, changed_by: null, note: `Sold on ${via === "shopify_pos" ? "Shopify POS" : "the website"}` });
    done.push(sku);
  }
  return NextResponse.json({ ok: true, sold: done });
}
