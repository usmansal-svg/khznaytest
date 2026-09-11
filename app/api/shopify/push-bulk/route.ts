/**
 * POST /api/shopify/push-bulk { skus: [...], visibility } — managers put a
 * chosen set of garments on Shopify, one after another (Shopify rate limits),
 * and get a result per SKU. Up to 200 per call.
 */
import { NextResponse } from "next/server";

import { requireManager } from "@/lib/auth/staff";
import type { Visibility } from "@/lib/shopify/client";
import { pushItem, type PushOutcome } from "@/lib/shopify/push-item";

export const instant = false;
export const maxDuration = 300;

export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { skus?: string[]; visibility?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body must be JSON." }, { status: 400 }); }
  const skus = [...new Set((body.skus ?? []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))].slice(0, 200);
  if (!skus.length) return NextResponse.json({ error: "No SKUs." }, { status: 400 });
  const visibility = (["draft", "pos", "online", "both"].includes(String(body.visibility)) ? body.visibility : "pos") as Visibility;
  const results: PushOutcome[] = [];
  for (const sku of skus) {
    results.push(await pushItem(gate.db, sku, visibility));
    await new Promise((r) => setTimeout(r, 250));
  }
  return NextResponse.json({ done: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
}
