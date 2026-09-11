/**
 * GET /api/pos/reports?from=&to=&outlet= — what sells, how fast, at what
 * price. Managers and the founder; every outlet unless one is chosen.
 * This is the feedback loop into the pricing sheet: sell-through by grade,
 * by selling profile and by sub-category, days to sell, sold price against
 * list, and the markdown stage mix.
 */
import { NextResponse } from "next/server";

import { requireManager } from "@/lib/auth/staff";
import { loadPricingContext } from "@/lib/pricing/repo";

export const instant = false;

type Line = { sold_price: number; sold_stage: string; list_price: number; returned_at: string | null; refund_amount: number | null; sales: { sold_at: string; outlet_id: number; voided_at: string | null; payment_method: string } | { sold_at: string; outlet_id: number; voided_at: string | null; payment_method: string }[] | null; items: unknown };
type Item = { grade_code: string; floored_on: string | null; landed_cost: number; is_rare: boolean; brand_tier: string; sub_categories: { name: string; profile_code: string; gender: string; categories: { name: string } | { name: string }[] | null } | { name: string; profile_code: string; gender: string; categories: { name: string } | { name: string }[] | null }[] | null };

export async function GET(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const url = new URL(request.url);
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")! + "T23:59:59+05:00") : new Date();
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")! + "T00:00:00+05:00") : new Date(to.getTime() - 30 * 86400_000);
  const outlet = url.searchParams.get("outlet");
  const db = gate.db;
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;

  let q = db.from("sale_items").select("sold_price, sold_stage, list_price, returned_at, refund_amount, sales!inner(sold_at, outlet_id, voided_at, payment_method), items(grade_code, floored_on, landed_cost, is_rare, brand_tier, sub_categories(name, profile_code, gender, categories(name)))").gte("sales.sold_at", from.toISOString()).lte("sales.sold_at", to.toISOString()).is("sales.voided_at", null).limit(20000);
  if (outlet) q = q.eq("sales.outlet_id", Number(outlet));
  const [{ data, error }, ctx, { data: floorRows }, { data: outlets }] = await Promise.all([
    q,
    loadPricingContext(db),
    (() => { let f = db.from("items").select("grade_code, floored_on, price, price_manual, status, outlet_id, sub_categories(name, profile_code)").in("status", ["on_floor", "sold", "pulled"]).not("floored_on", "is", null).limit(50000); if (outlet) f = f.eq("outlet_id", Number(outlet)); return f; })(),
    db.from("outlets").select("id, name").eq("active", true).eq("is_online", false).order("id"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lines = ((data ?? []) as unknown as Line[]).filter((l) => !l.returned_at);
  const num = (v: unknown) => Number(v ?? 0);
  const grouped = <K extends string>(key: (l: Line) => K) => {
    const out: Record<string, { sold: number; revenue: number; list: number; cost: number; days: number[]; stages: Record<string, number> }> = {};
    for (const l of lines) {
      const it = one<Item>(l.items);
      const k = key(l);
      const g = (out[k] ??= { sold: 0, revenue: 0, list: 0, cost: 0, days: [], stages: {} });
      g.sold++; g.revenue += l.sold_price; g.list += l.list_price; g.cost += num(it?.landed_cost);
      const sale = one<{ sold_at: string }>(l.sales);
      if (it?.floored_on && sale?.sold_at) g.days.push(Math.max(0, (new Date(sale.sold_at).getTime() - new Date(it.floored_on).getTime()) / 86400_000));
      g.stages[l.sold_stage] = (g.stages[l.sold_stage] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(out).map(([k, g]) => {
      const sortedDays = [...g.days].sort((a, b) => a - b);
      return [k, { sold: g.sold, revenue: g.revenue, avg_sold: Math.round(g.revenue / g.sold), avg_list: Math.round(g.list / g.sold), realised_pct: g.list ? Math.round((g.revenue / g.list) * 100) : null, gp_pct: g.revenue ? Math.round(((g.revenue / (1 + ctx.settings.salesTax) - g.cost) / (g.revenue / (1 + ctx.settings.salesTax))) * 100) : null, median_days: sortedDays.length ? Math.round(sortedDays[Math.floor(sortedDays.length / 2)]) : null, stages: g.stages }];
    }));
  };

  // Sell-through: of everything floored in the window (by floored_on), how much has sold, and at which stage.
  const floored = (floorRows ?? []).filter((r) => r.floored_on && new Date(r.floored_on) >= from && new Date(r.floored_on) <= to);
  const sellThrough = (key: (r: (typeof floored)[number]) => string) => {
    const out: Record<string, { floored: number; sold: number; pulled: number; on_floor: number }> = {};
    for (const r of floored) { const g = (out[key(r)] ??= { floored: 0, sold: 0, pulled: 0, on_floor: 0 }); g.floored++; if (r.status === "sold") g.sold++; else if (r.status === "pulled") g.pulled++; else g.on_floor++; }
    return Object.fromEntries(Object.entries(out).map(([k, g]) => [k, { ...g, sell_through_pct: g.floored ? Math.round((g.sold / g.floored) * 100) : 0 }]));
  };
  const subOf = (r: { sub_categories: unknown }) => one<{ name: string; profile_code: string }>(r.sub_categories);

  const stageMix: Record<string, number> = {};
  for (const l of lines) stageMix[l.sold_stage] = (stageMix[l.sold_stage] ?? 0) + 1;
  const daily: Record<string, { revenue: number; sold: number }> = {};
  for (const l of lines) { const d = new Date(new Date(one<{ sold_at: string }>(l.sales)!.sold_at).getTime() + 5 * 3600_000).toISOString().slice(0, 10); const g = (daily[d] ??= { revenue: 0, sold: 0 }); g.revenue += l.sold_price; g.sold++; }

  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(), outlets,
    totals: { sold: lines.length, revenue: lines.reduce((a, l) => a + l.sold_price, 0), list: lines.reduce((a, l) => a + l.list_price, 0), cost: lines.reduce((a, l) => a + num(one<Item>(l.items)?.landed_cost), 0), returns: ((data ?? []) as unknown as Line[]).filter((l) => l.returned_at).length, refunds: ((data ?? []) as unknown as Line[]).reduce((a, l) => a + (l.returned_at ? l.refund_amount ?? 0 : 0), 0) },
    by_grade: grouped((l) => one<Item>(l.items)?.grade_code ?? "?"),
    by_profile: grouped((l) => one<Item["sub_categories"] extends infer S ? (S extends unknown[] ? S[number] : S) : never>(one<Item>(l.items)?.sub_categories)?.profile_code ?? "?"),
    by_sub_category: grouped((l) => { const it = one<Item>(l.items); const s = one<{ name: string; gender: string }>(it?.sub_categories); return s ? `${s.gender} · ${s.name}` : "?"; }),
    by_outlet: grouped((l) => String(one<{ outlet_id: number }>(l.sales)?.outlet_id ?? "?")),
    by_stage: stageMix,
    by_day: daily,
    sell_through_by_grade: sellThrough((r) => r.grade_code),
    sell_through_by_profile: sellThrough((r) => subOf(r)?.profile_code ?? "?"),
    sell_through_by_sub_category: sellThrough((r) => subOf(r)?.name ?? "?"),
    assumed: { grades: Object.fromEntries(ctx.refs.grades.map((g) => [g.code, g.shareOfIntake])), profiles: Object.fromEntries(ctx.refs.profiles.map((p) => [p.code, { full: p.volFull, md1: p.volMd1, md2: p.volMd2, md3: p.volMd3, pulled: p.pulledShare }])) },
  });
}
