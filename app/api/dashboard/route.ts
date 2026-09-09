/**
 * GET /api/dashboard?days=30 — the founder's view. Founder and managers only.
 *
 * Answers: how much are we tagging, how fast, who is good at it, what is it
 * worth, where is it, and what needs attention. Everything is computed from
 * the items log, so it is as honest as the tagging is.
 */

import { NextResponse } from "next/server";

import { requireManager } from "@/lib/auth/staff";
import { ADJUSTMENT_CAP } from "@/lib/pricing/constants";

const DAY = 86400_000;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

export async function GET(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const db = gate.db;
  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  const now = Date.now();
  const since = new Date(now - days * DAY).toISOString();

  const [itemsRes, transfersRes, staffRes, outletsRes, lotsRes, alertsRes, brandsRes] = await Promise.all([
    db.from("items").select("id, sku, tagged_at, tagged_by, outlet_id, grade_code, adjustment, adjust_pct, status, channel, online_status, price, price_manual, standard_price, landed_cost, colour_tag, floored_on, photos, shopify_product_id, shopify_error, shopify_synced_at, received_at, lot_id, weight_kg, sub_categories(name, gender, categories(name))").gte("tagged_at", since).order("tagged_at", { ascending: false }),
    db.from("transfers").select("id, code, to_outlet_id, status, created_at, sent_at, received_at, note, created_by, transfer_items(item_id, items(sku))").order("created_at", { ascending: false }).limit(50),
    db.from("staff").select("id, name, role, active"),
    db.from("outlets").select("id, name, is_online"),
    db.from("lots").select("id, code, supplier, basis, status, kg, kg_tagged, pieces, description"),
    db.from("price_alerts").select("id, sku, tagged_by, standard_price, final_price, pct_below, kind, reason, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(200),
    db.from("brands").select("id, name, added_at, staff:added_by(name)").eq("source", "tagger").eq("tier", "regular").eq("active", true).order("added_at", { ascending: false }).limit(50),
  ]);
  const err = itemsRes.error ?? transfersRes.error ?? staffRes.error ?? outletsRes.error ?? lotsRes.error ?? alertsRes.error ?? brandsRes.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  type Item = NonNullable<typeof itemsRes.data>[number];
  const items = itemsRes.data ?? [];
  const staffName = new Map((staffRes.data ?? []).map((s) => [s.id, s.name]));
  const outletName = new Map((outletsRes.data ?? []).map((o) => [o.id, o.name]));
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const listPrice = (i: Item) => Number(i.price_manual ?? i.price ?? 0);
  const dayOf = (iso: string) => iso.slice(0, 10);
  const today = dayOf(new Date().toISOString());
  const weekAgo = new Date(now - 7 * DAY).toISOString();
  const photosOf = (i: Item) => ((i.photos as unknown[] | null)?.length ?? 0);

  /* ------------------------------------------------------------ KPIs */
  const sum = (xs: Item[], f: (i: Item) => number) => xs.reduce((s, i) => s + f(i), 0);
  const todayItems = items.filter((i) => dayOf(i.tagged_at) === today);
  const weekItems = items.filter((i) => i.tagged_at >= weekAgo);
  const rejects = items.filter((i) => i.grade_code === "rejected").length;
  const value = sum(items, listPrice), cost = sum(items, (i) => Number(i.landed_cost ?? 0));

  // Pieces per active hour today: gaps under 20 minutes between a tagger's saves count as working time.
  const activeSecondsToday = (() => {
    let secs = 0;
    const byT = new Map<number, number[]>();
    for (const i of todayItems) { const k = i.tagged_by ?? 0; if (!byT.has(k)) byT.set(k, []); byT.get(k)!.push(new Date(i.tagged_at).getTime()); }
    for (const ts of byT.values()) { ts.sort((a, b) => a - b); for (let j = 1; j < ts.length; j++) { const gap = (ts[j] - ts[j - 1]) / 1000; if (gap <= 1200) secs += gap; } }
    return secs;
  })();

  /* --------------------------------------------------------- by day */
  const byDay = new Map<string, { n: number; value: number }>();
  for (let d = days - 1; d >= 0; d--) byDay.set(dayOf(new Date(now - d * DAY).toISOString()), { n: 0, value: 0 });
  for (const i of items) { const k = dayOf(i.tagged_at); const e = byDay.get(k); if (e) { e.n += 1; e.value += listPrice(i); } }

  /* ------------------------------------------------------- taggers */
  const alerts = (alertsRes.data ?? []).map((a) => ({ ...a, tagger: staffName.get(a.tagged_by ?? 0) ?? "Unknown", pct_below: Number(a.pct_below) }));
  const belowBy = new Map<number, number>();
  for (const a of alertsRes.data ?? []) belowBy.set(a.tagged_by ?? 0, (belowBy.get(a.tagged_by ?? 0) ?? 0) + 1);

  const byTagger = new Map<number, Item[]>();
  for (const i of items) { const k = i.tagged_by ?? 0; if (!byTagger.has(k)) byTagger.set(k, []); byTagger.get(k)!.push(i); }
  const taggers = [...byTagger.entries()].map(([id, list]) => {
    const ts = list.map((i) => new Date(i.tagged_at).getTime()).sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let j = 1; j < ts.length; j++) { const g = (ts[j] - ts[j - 1]) / 1000; if (g > 5 && g <= 1200) gaps.push(g); }
    const daysActive = new Set(list.map((i) => dayOf(i.tagged_at))).size;
    const sellable = list.filter((i) => i.grade_code !== "rejected");
    const above = list.filter((i) => (i.adjust_pct ?? 0) > 0).length, below = list.filter((i) => (i.adjust_pct ?? 0) < 0).length;
    return {
      id, name: staffName.get(id) ?? "Unknown",
      tagged: list.length, today: list.filter((i) => dayOf(i.tagged_at) === today).length, week: list.filter((i) => i.tagged_at >= weekAgo).length,
      per_day: Math.round(list.length / Math.max(1, daysActive)), days_active: daysActive,
      secs_per_garment: median(gaps),
      premium_pct: sellable.length ? sellable.filter((i) => i.grade_code === "premium" || i.grade_code === "bnwt").length / sellable.length : 0,
      rejects: list.length - sellable.length, reject_pct: list.length ? (list.length - sellable.length) / list.length : 0,
      avg_adjust: list.length ? list.reduce((s, i) => s + (i.adjust_pct ?? 0), 0) / list.length : 0,
      above_pct: list.length ? above / list.length : 0, below_pct: list.length ? below / list.length : 0,
      balance_flag: list.length >= 20 && (above / list.length > ADJUSTMENT_CAP || below / list.length > ADJUSTMENT_CAP),
      under_priced: belowBy.get(id) ?? 0,
      manual_prices: list.filter((i) => i.price_manual != null && i.status !== "set_aside").length,
      no_photo: sellable.filter((i) => photosOf(i) === 0).length,
      value: Math.round(list.reduce((s, i) => s + listPrice(i), 0)),
      last_tagged: list[0]?.tagged_at ?? null,
    };
  }).sort((a, b) => b.tagged - a.tagged);

  /* ------------------------------------------------- catalogue mix */
  const gradeMix: Record<string, number> = {};
  const byCategory = new Map<string, { n: number; value: number }>();
  const byGender = new Map<string, number>();
  for (const i of items) {
    gradeMix[i.grade_code] = (gradeMix[i.grade_code] ?? 0) + 1;
    const sc = one<{ name: string; gender: string; categories: unknown }>(i.sub_categories);
    const cat = one<{ name: string }>(sc?.categories)?.name ?? "—";
    const key = `${sc?.gender ?? "?"} · ${cat}`;
    const e = byCategory.get(key) ?? { n: 0, value: 0 }; e.n += 1; e.value += listPrice(i); byCategory.set(key, e);
    byGender.set(sc?.gender ?? "?", (byGender.get(sc?.gender ?? "?") ?? 0) + 1);
  }

  /* ------------------------------------------------------ outlets */
  const offline = items.filter((i) => i.channel !== "online");
  const byOutlet = new Map<number | null, { name: string; tagged: number; awaiting_floor: number; on_floor: number; on_floor_value: number; sold: number; pulled: number; colours: Record<string, number> }>();
  for (const i of offline) {
    const k = i.outlet_id ?? null;
    if (!byOutlet.has(k)) byOutlet.set(k, { name: k == null ? "Not yet sent" : outletName.get(k) ?? `#${k}`, tagged: 0, awaiting_floor: 0, on_floor: 0, on_floor_value: 0, sold: 0, pulled: 0, colours: {} });
    const o = byOutlet.get(k)!;
    o.tagged += 1;
    if (i.status === "tagged") o.awaiting_floor += 1;
    if (i.status === "on_floor") { o.on_floor += 1; o.on_floor_value += listPrice(i); if (i.colour_tag) o.colours[i.colour_tag] = (o.colours[i.colour_tag] ?? 0) + 1; }
    if (i.status === "sold") o.sold += 1;
    if (i.status === "pulled") o.pulled += 1;
  }

  /* ---------------------------------------------------- transfers */
  const transfers = (transfersRes.data ?? []).map((t) => {
    const lines = (t.transfer_items as { items: unknown }[] | null) ?? [];
    const sent = t.sent_at ? new Date(t.sent_at).getTime() : null, recv = t.received_at ? new Date(t.received_at).getTime() : null;
    return { id: t.id, code: t.code, to_outlet: outletName.get(t.to_outlet_id) ?? "", status: t.status, created_by: staffName.get(t.created_by ?? 0) ?? "", created_at: t.created_at, sent_at: t.sent_at, received_at: t.received_at, note: t.note, pieces: lines.length, skus: lines.map((l) => one<{ sku: string }>(l.items)?.sku).filter(Boolean), transit_hours: sent && recv ? Math.round((recv - sent) / 36e5) : null };
  });

  /* --------------------------------------------------------- lots */
  const kgByLot = new Map<number, { kg: number; pieces: number }>();
  for (const i of items) if (i.lot_id) { const e = kgByLot.get(i.lot_id) ?? { kg: 0, pieces: 0 }; e.kg += Number(i.weight_kg ?? 0); e.pieces += 1; kgByLot.set(i.lot_id, e); }
  const lots = (lotsRes.data ?? []).filter((l) => l.status === "open").map((l) => {
    const done = kgByLot.get(l.id) ?? { kg: 0, pieces: 0 };
    const bought = l.basis === "kg" ? Number(l.kg ?? 0) : Number(l.pieces ?? 0);
    const used = l.basis === "kg" ? done.kg : done.pieces;
    return { code: l.code, supplier: l.supplier, description: l.description, basis: l.basis, bought, used: Math.round(used * 100) / 100, pieces: done.pieces, pct_done: bought ? Math.min(1, used / (l.basis === "kg" ? bought * 0.9 : bought)) : null };
  }).sort((a, b) => (b.pct_done ?? 0) - (a.pct_done ?? 0));

  /* ------------------------------------------------------ online */
  const online = items.filter((i) => i.channel === "online");
  const pipeline = { draft: 0, ready: 0, listed: 0, unlisted: 0 };
  let listedValue = 0, noPhotos = 0, errors = 0;
  for (const i of online) { const s = (i.online_status ?? "draft") as keyof typeof pipeline; pipeline[s] = (pipeline[s] ?? 0) + 1; if (s === "listed") listedValue += listPrice(i); if (!photosOf(i)) noPhotos += 1; if (i.shopify_error) errors += 1; }

  return NextResponse.json({
    days,
    kpis: {
      today: todayItems.length, week: weekItems.length, period: items.length,
      per_hour_today: activeSecondsToday > 0 ? Math.round((todayItems.length / (activeSecondsToday / 3600)) * 10) / 10 : null,
      value: Math.round(value), cost: Math.round(cost), expected_gp: Math.round(value / 1.05 - cost), gp_pct: value ? (value / 1.05 - cost) / (value / 1.05) : 0,
      rejects, reject_pct: items.length ? rejects / items.length : 0,
      awaiting_floor: offline.filter((i) => i.status === "tagged" && i.outlet_id == null).length,
      in_transit: transfers.filter((t) => t.status === "sent").reduce((s, t) => s + t.pieces, 0),
      on_floor: offline.filter((i) => i.status === "on_floor").length,
      active_taggers_today: new Set(todayItems.map((i) => i.tagged_by)).size,
    },
    attention: {
      under_priced: alerts.length,
      new_brands: (brandsRes.data ?? []).map((b) => ({ name: b.name, by: one<{ name: string }>(b.staff)?.name ?? "—", at: b.added_at })),
      no_photo: items.filter((i) => i.grade_code !== "rejected" && photosOf(i) === 0).length,
      lots_nearly_done: lots.filter((l) => (l.pct_done ?? 0) >= 0.85).map((l) => l.code),
      set_aside: items.filter((i) => i.status === "set_aside").length,
    },
    by_day: [...byDay.entries()].map(([day, v]) => ({ day, n: v.n, value: Math.round(v.value) })),
    taggers,
    grade_mix: gradeMix,
    categories: [...byCategory.entries()].map(([name, v]) => ({ name, n: v.n, value: Math.round(v.value) })).sort((a, b) => b.n - a.n).slice(0, 12),
    genders: [...byGender.entries()].map(([g, n]) => ({ gender: g, n })),
    outlets: [...byOutlet.entries()].map(([id, o]) => ({ id, ...o, on_floor_value: Math.round(o.on_floor_value) })),
    transfers,
    lots,
    alerts,
    recent: items.slice(0, 20).map((i) => ({ sku: i.sku, tagged_at: i.tagged_at, tagger: staffName.get(i.tagged_by ?? 0) ?? "", sub_category: one<{ name: string }>(i.sub_categories)?.name ?? "", grade: i.grade_code, price: listPrice(i), photos: photosOf(i), status: i.status })),
    online: { totals: { items: online.length, ...pipeline, listed_value: Math.round(listedValue), no_photos: noPhotos, errors } },
  });
}
