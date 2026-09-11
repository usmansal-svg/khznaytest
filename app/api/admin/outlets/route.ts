/**
 * GET   /api/admin/outlets — outlets with their Shopify location, plus the store's locations to choose from
 * PATCH /api/admin/outlets { id, name?, shopify_location_id?, active? }
 */
import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";
import { listLocations, shopifyConfig } from "@/lib/shopify/client";

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
