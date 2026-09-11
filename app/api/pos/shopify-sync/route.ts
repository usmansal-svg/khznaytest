/**
 * POST /api/pos/shopify-sync — work the sold-out queue. Called by the till
 * after each sale and by the nightly cron (vercel.json), so a garment sold at
 * an outlet never stays live online past the night even when a call failed.
 */
import { NextResponse } from "next/server";

import { currentStaff, dbFor } from "@/lib/auth/staff";
import { createServiceClient } from "@/lib/supabase/service";
import { processSoldOutQueue } from "@/lib/pos/shopify-soldout";

export const instant = false;

export async function POST(request: Request) {
  const me = await currentStaff();
  const cron = request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}` && Boolean(process.env.CRON_SECRET);
  if (!me && !cron) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const db = cron ? createServiceClient() : await dbFor(me);
  const result = await processSoldOutQueue(db, 50);
  const { count } = await db.from("shopify_sync_queue").select("id", { count: "exact", head: true }).is("done_at", null);
  return NextResponse.json({ ...result, pending: count ?? 0 });
}

export async function GET(request: Request) {
  return POST(request);
}
