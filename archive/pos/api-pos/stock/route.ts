/** GET /api/pos/stock?q= — what is on the floor at this outlet: stage, price today, days on floor. */
import { NextResponse } from "next/server";

import { requirePos } from "@/lib/pos/auth";
import { currentPrice, daysOnFloor } from "@/lib/pos/pricing";
import { loadPricingContext } from "@/lib/pricing/repo";

export const instant = false;

export async function GET(request: Request) {
  const gate = await requirePos(request);
  if ("response" in gate) return gate.response;
  const q = new URL(request.url).searchParams.get("q")?.trim();
  const { db, outletId } = gate;
  let query = db.from("items").select("id, sku, brand_text, size_label, grade_code, price, price_manual, floored_on, colour_tag, status, is_rare, online_status, sub_categories(name, gender, categories(name))").eq("outlet_id", outletId).in("status", ["on_floor", "tagged"]).order("floored_on", { ascending: true }).limit(2000);
  if (q) query = query.or(`sku.ilike.%${q}%,brand_text.ilike.%${q}%`);
  const [{ data, error }, ctx] = await Promise.all([query, loadPricingContext(db)]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const rows = (data ?? []).map((i) => {
    const list = i.price_manual ?? i.price ?? 0;
    const { stage, price } = currentPrice(list, i.floored_on, ctx.settings);
    const sub = one<{ name: string; gender: string; categories: unknown }>(i.sub_categories);
    return { id: i.id, sku: i.sku, brand: i.brand_text, size: i.size_label, grade: i.grade_code, sub_category: sub?.name ?? "", category: one<{ name: string }>(sub?.categories)?.name ?? "", gender: sub?.gender ?? "", list_price: list, stage, price, days: daysOnFloor(i.floored_on), floored_on: i.floored_on, colour: i.colour_tag, status: i.status, rare: i.is_rare, online: i.online_status === "listed" };
  });
  const byStage: Record<string, { count: number; value: number }> = {};
  for (const r of rows) { const s = (byStage[r.stage] ??= { count: 0, value: 0 }); s.count++; s.value += r.price; }
  return NextResponse.json({ rows, summary: { count: rows.length, value: rows.reduce((a, r) => a + r.price, 0), by_stage: byStage } });
}
