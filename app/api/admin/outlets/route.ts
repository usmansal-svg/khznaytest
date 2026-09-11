/**
 * GET   /api/admin/outlets — outlets with their Shopify location, plus the store's locations to choose from
 * PATCH /api/admin/outlets { id, name?, shopify_location_id?, active? }
 */
import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";
import { ensureOrderWebhook, listLocations, shopifyConfig } from "@/lib/shopify/client";

export const instant = false;

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const { data, error } = await gate.db.from("outlets").select("id, name, city, is_online, active, shopify_location_id").order("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const cfg = shopifyConfig();
  let locations: { id: string; name: string; active: boolean }[] = [];
  let shopify_error: string | null = null;
  if (cfg) { try { locations = await listLocations(cfg); } catch (e) { shopify_error = e instanceof Error ? e.message : "Could not read Shopify locations."; } }
  return NextResponse.json({ outlets: data ?? [], locations, shopify_connected: Boolean(cfg), shopify_error });
}

/** POST /api/admin/outlets { action: "register_webhook" } — the app registers its paid-orders webhook with Shopify. */
export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { action?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body must be JSON." }, { status: 400 }); }
  if (body.action !== "register_webhook") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const cfg = shopifyConfig();
  if (!cfg) return NextResponse.json({ error: "Shopify is not connected." }, { status: 503 });
  const origin = new URL(request.url).origin.replace("http://", "https://");
  try {
    const r = await ensureOrderWebhook(cfg, `${origin}/api/shopify/webhook`);
    await audit(gate.db, gate.staff.id, "shopify_webhook", r.id, null, { created: r.created, url: `${origin}/api/shopify/webhook` }, r.created ? "Order webhook registered with Shopify" : "Order webhook already registered");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Shopify refused." }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { id?: number; name?: string; shopify_location_id?: string | null; active?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body must be JSON." }, { status: 400 }); }
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) { const n = body.name.trim(); if (n.length < 2) return NextResponse.json({ error: "Name too short." }, { status: 400 }); patch.name = n; }
  if (body.shopify_location_id !== undefined) patch.shopify_location_id = body.shopify_location_id?.trim() || null;
  if (body.active !== undefined) patch.active = Boolean(body.active);
  const { data: before } = await gate.db.from("outlets").select("name, shopify_location_id, active").eq("id", body.id).maybeSingle();
  const { error } = await gate.db.from("outlets").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(gate.db, gate.staff.id, "outlets", String(body.id), before, { ...before, ...patch });
  return NextResponse.json({ ok: true });
}
