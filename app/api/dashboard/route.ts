/**
 * GET /api/dashboard?days=30 — the master view. Founder and managers only.
 *
 * Offline: tagging throughput by day and by tagger, grade mix, rejects,
 * adjustment balance, stock by outlet and colour, every shipment with
 * dispatched and received times. Online: the Shopify pipeline.
 */

import { NextResponse } from "next/server";

import { requireManager } from "@/lib/auth/staff";
import { ADJUSTMENT_CAP } from "@/lib/pricing/constants";

export async function GET(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const db = gate.db;
  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [itemsRes, transfersRes, staffRes, outletsRes, lotsRes] = await Promise.all([
    db.from("items").select("id, sku, tagged_at, tagged_by, outlet_id, grade_code, adjustment, status, channel, online_status, price, price_manual, landed_cost, colour_tag, floored_on, photos, shopify_product_id, shopify_error, shopify_synced_at, received_at, lot_id, sub_categories(name)").gte("tagged_at", since).order("tagged_at", { ascending: false }),
    db.from("transfers").select("id, code, to_outlet_id, status, created_at, sent_at, received_at, note, created_by, transfer_items(item_id, items(sku))").order("created_at", { ascending: false }).limit(50),
    db.from("staff").select("id, name, role, active"),
    db.from("outlets").select("id, name, is_online"),
    db.from("lots").select("id, code, supplier, basis, status, kg, kg_tagged"),
  ]);
  const err = itemsRes.error ?? transfersRes.error ?? staffRes.error ?? outletsRes.error ?? lotsRes.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  type Item = NonNullable<typeof itemsRes.data>[number];
  const items = itemsRes.data ?? [];
  const staffName = new Map((staffRes.data ?? []).map((s) => [s.id, s.name]));
  const outletName = new Map((outletsRes.data ?? []).map((o) => [o.id, o.name]));
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const listPrice = (i: Item) => Number(i.price_manual ?? i.price ?? 0);
  const dayOf = (iso: string) => iso.slice(0, 10);
  const today = dayOf(new Date().toISOString());

  /* ---------------------------------------------------------- offline */
  const offline = items.filter((i) => i.channel !== "online");
  const byDay = new Map<string, number>();
  for (let d = days - 1; d >= 0; d--) byDay.set(dayOf(new Date(Date.now() - d * 86400_000).toISOString()), 0);
  for (const i of items) { const k = dayOf(i.tagged_at); if (byDay.has(k)) byDay.set(k, byDay.get(k)! + 1); }

  const byTagger = new Map<number, { name: string; tagged: number; today: number; rejects: number; above: number; below: number; value: number; days: Set<string> }>();
  for (const i of items) {
    const id = i.tagged_by ?? 0;
    if (!byTagger.has(id)) byTagger.set(id, { name: staffName.get(id) ?? "Unknown", tagged: 0, today: 0, rejects: 0, above: 0, below: 0, value: 0, days: new Set() });
    const t = byTagger.get(id)!;
    t.tagged += 1;
    if (dayOf(i.tagged_at) === today) t.today += 1;
    if (i.grade_code === "rejected") t.rejects += 1;
    if (i.adjustment === "above") t.above += 1;
    if (i.adjustment === "below") t.below += 1;
    t.value += listPrice(i);
    t.days.add(dayOf(i.tagged_at));
  }
  const taggers = [...byTagger.values()].map((t) => ({
    name: t.name, tagged: t.tagged, today: t.today, per_day: Math.round(t.tagged / Math.max(1, t.days.size)), rejects: t.rejects,
    above_pct: t.tagged ? t.above / t.tagged : 0, below_pct: t.tagged ? t.below / t.tagged : 0,
    balance_flag: t.tagged >= 20 && (t.above / t.tagged > ADJUSTMENT_CAP || t.below / t.tagged > ADJUSTMENT_CAP || Math.abs(t.above - t.below) / t.tagged > 0.1),
    value: Math.round(t.value),
  })).sort((a, b) => b.tagged - a.tagged);

  const gradeMix: Record<string, number> = {};
  for (const i of items) gradeMix[i.grade_code] = (gradeMix[i.grade_code] ?? 0) + 1;

  const byOutlet = new Map<number | null, { name: string; tagged: number; awaiting_floor: number; on_floor: number; on_floor_value: number; sold: number; pulled: number; colours: Record<string, number> }>();
  for (const i of offline) {
    const k = i.outlet_id ?? null;
    if (!byOutlet.has(k)) byOutlet.set(k, { name: k == null ? "Undecided" : outletName.get(k) ?? `#${k}`, tagged: 0, awaiting_floor: 0, on_floor: 0, on_floor_value: 0, sold: 0, pulled: 0, colours: {} });
    const o = byOutlet.get(k)!;
    o.tagged += 1;
    if (i.status === "tagged") o.awaiting_floor += 1;
    if (i.status === "on_floor") { o.on_floor += 1; o.on_floor_value += listPrice(i); if (i.colour_tag) o.colours[i.colour_tag] = (o.colours[i.colour_tag] ?? 0) + 1; }
    if (i.status === "sold") o.sold += 1;
    if (i.status === "pulled") o.pulled += 1;
  }

  const transfers = (transfersRes.data ?? []).map((t) => {
    const lines = (t.transfer_items as { items: unknown }[] | null) ?? [];
    const sent = t.sent_at ? new Date(t.sent_at).getTime() : null, recv = t.received_at ? new Date(t.received_at).getTime() : null;
    return {
      id: t.id, code: t.code, to_outlet: outletName.get(t.to_outlet_id) ?? "", status: t.status, created_by: staffName.get(t.created_by ?? 0) ?? "",
      created_at: t.created_at, sent_at: t.sent_at, received_at: t.received_at, note: t.note,
      pieces: lines.length, skus: lines.map((l) => one<{ sku: string }>(l.items)?.sku).filter(Boolean),
      transit_hours: sent && recv ? Math.round((recv - sent) / 36e5) : null,
    };
  });

  /* ----------------------------------------------------------- online */
  const online = items.filter((i) => i.channel === "online");
  const pipeline = { draft: 0, ready: 0, listed: 0, unlisted: 0 };
  let listedValue = 0, noPhotos = 0, errors = 0;
  for (const i of online) {
    const s = (i.online_status ?? "draft") as keyof typeof pipeline;
    pipeline[s] = (pipeline[s] ?? 0) + 1;
    if (s === "listed") listedValue += listPrice(i);
    if (!(i.photos as unknown[] | null)?.length) noPhotos += 1;
    if (i.shopify_error) errors += 1;
  }

  const lots = (lotsRes.data ?? []).map((l) => ({ ...l, kg: l.kg == null ? null : Number(l.kg), kg_tagged: l.kg_tagged == null ? null : Number(l.kg_tagged) }));

  return NextResponse.json({
    days,
    offline: {
      totals: {
        tagged: items.length, today: items.filter((i) => dayOf(i.tagged_at) === today).length,
        value: Math.round(items.reduce((s, i) => s + listPrice(i), 0)), cost: Math.round(items.reduce((s, i) => s + Number(i.landed_cost ?? 0), 0)),
        rejects: gradeMix.rejected ?? 0, reject_pct: items.length ? (gradeMix.rejected ?? 0) / items.length : 0,
        awaiting_floor: offline.filter((i) => i.status === "tagged").length, on_floor: offline.filter((i) => i.status === "on_floor").length,
        in_transit: transfers.filter((t) => t.status === "sent").reduce((s, t) => s + t.pieces, 0),
      },
      by_day: [...byDay.entries()].map(([day, n]) => ({ day, n })),
      taggers,
      grade_mix: gradeMix,
      outlets: [...byOutlet.entries()].map(([id, o]) => ({ id, ...o, on_floor_value: Math.round(o.on_floor_value) })),
      transfers,
      lots: { open: lots.filter((l) => l.status === "open").length, closed: lots.filter((l) => l.status === "closed").length },
      recent: items.slice(0, 25).map((i) => ({ sku: i.sku, tagged_at: i.tagged_at, tagger: staffName.get(i.tagged_by ?? 0) ?? "", sub_category: one<{ name: string }>(i.sub_categories)?.name ?? "", grade: i.grade_code, price: listPrice(i), outlet: i.outlet_id ? outletName.get(i.outlet_id) ?? "" : "", status: i.status })),
    },
    online: {
      totals: { items: online.length, ...pipeline, listed_value: Math.round(listedValue), no_photos: noPhotos, errors },
      recent: online.slice(0, 25).map((i) => ({ sku: i.sku, tagged_at: i.tagged_at, tagger: staffName.get(i.tagged_by ?? 0) ?? "", sub_category: one<{ name: string }>(i.sub_categories)?.name ?? "", price: listPrice(i), online_status: i.online_status, photos: (i.photos as unknown[] | null)?.length ?? 0, synced_at: i.shopify_synced_at, error: i.shopify_error })),
    },
  });
}
