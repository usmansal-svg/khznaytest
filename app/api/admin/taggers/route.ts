/**
 * GET  /api/admin/taggers?month=YYYY-MM — the monthly scorecard per tagger
 * POST /api/admin/taggers { month, staff_id, note? } — finalise a score
 *
 * Two KPIs, one score:
 *   target achievement = garments tagged ÷ (days worked × daily target), capped at 100
 *   accuracy           = 100 − (garments corrected by QC ÷ garments reviewed)
 *   score              = 60% target achievement + 40% accuracy
 */
import { NextResponse } from "next/server";

import { requireManager } from "@/lib/auth/staff";

export const instant = false;

const W_TARGET = 0.6;
const W_ACCURACY = 0.4;

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - 5 * 3600_000);
  const end = new Date(Date.UTC(y, m, 1) - 5 * 3600_000);
  return { start: start.toISOString(), end: end.toISOString(), first: `${month}-01` };
}

export async function GET(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
  const { start, end, first } = monthRange(month);
  const db = gate.db;
  const [{ data: staff }, { data: items }, { data: reviews }, { data: alerts }, { data: settings }, { data: finals }] = await Promise.all([
    db.from("staff").select("id, name, role, active, daily_target").in("role", ["tagger", "qc_senior", "manager", "founder"]),
    db.from("items").select("id, tagged_by, tagged_at, grade_code, price_manual").gte("tagged_at", start).lt("tagged_at", end).limit(100000),
    db.from("qc_reviews").select("id, item_id, tagger_id, reviewed_by, reviewed_at, outcome, corrections, price_before, price_after, note, items(sku)").gte("reviewed_at", start).lt("reviewed_at", end).limit(20000),
    db.from("price_alerts").select("tagged_by").gte("created_at", start).lt("created_at", end).limit(20000),
    db.from("settings").select("default_daily_target").order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("tagger_scores").select("staff_id, score, note, finalised_at, finalised_by").eq("month", first),
  ]);
  const defaultTarget = Number(settings?.default_daily_target ?? 60);
  const name = new Map((staff ?? []).map((s) => [s.id, s.name]));
  const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString().slice(0, 10);
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;

  const byTagger = new Map<number, { days: Set<string>; tagged: number; rejects: number; manual: number }>();
  for (const i of items ?? []) { const k = i.tagged_by ?? 0; const e = byTagger.get(k) ?? { days: new Set<string>(), tagged: 0, rejects: 0, manual: 0 }; e.days.add(dayOf(i.tagged_at)); e.tagged++; if (i.grade_code === "rejected") e.rejects++; if (i.price_manual != null) e.manual++; byTagger.set(k, e); }
  const revBy = new Map<number, { reviewed: number; corrected: number; fields: Record<string, number>; grade_low: number; grade_high: number; rupees: number; recent: unknown[] }>();
  const RANK: Record<string, number> = { rejected: 0, very_good: 1, excellent: 2, premium: 3, bnwt: 4 };
  for (const r of reviews ?? []) {
    const k = r.tagger_id ?? 0;
    const e = revBy.get(k) ?? { reviewed: 0, corrected: 0, fields: {}, grade_low: 0, grade_high: 0, rupees: 0, recent: [] };
    e.reviewed++;
    if (r.outcome === "corrected") {
      e.corrected++;
      for (const c of (r.corrections ?? []) as { field: string; from: string; to: string }[]) {
        e.fields[c.field] = (e.fields[c.field] ?? 0) + 1;
        if (c.field === "grade") { if (RANK[c.to] > RANK[c.from]) e.grade_low++; else e.grade_high++; }
      }
      if (r.price_after != null && r.price_before != null) e.rupees += r.price_after - r.price_before;
      if (e.recent.length < 30) e.recent.push({ sku: one<{ sku: string }>(r.items)?.sku, at: r.reviewed_at, by: name.get(r.reviewed_by) ?? "", corrections: r.corrections, note: r.note });
    }
    revBy.set(k, e);
  }
  const under = new Map<number, number>();
  for (const a of alerts ?? []) under.set(a.tagged_by ?? 0, (under.get(a.tagged_by ?? 0) ?? 0) + 1);
  const finalBy = new Map((finals ?? []).map((f) => [f.staff_id, f]));

  const ids = new Set<number>([...byTagger.keys(), ...revBy.keys()]);
  const taggers = [...ids].filter((id) => id).map((id) => {
    const t = byTagger.get(id) ?? { days: new Set<string>(), tagged: 0, rejects: 0, manual: 0 };
    const r = revBy.get(id) ?? { reviewed: 0, corrected: 0, fields: {}, grade_low: 0, grade_high: 0, rupees: 0, recent: [] };
    const target = (staff ?? []).find((s) => s.id === id)?.daily_target ?? defaultTarget;
    const expected = t.days.size * target;
    const targetPct = expected ? Math.min(100, Math.round((t.tagged / expected) * 100)) : 0;
    const accuracyPct = r.reviewed ? Math.round(100 - (r.corrected / r.reviewed) * 100) : null;
    const score = Math.round(W_TARGET * targetPct + W_ACCURACY * (accuracyPct ?? 100));
    const f = finalBy.get(id);
    return {
      id, name: name.get(id) ?? "Unknown", days_worked: t.days.size, tagged: t.tagged, per_day: t.days.size ? Math.round(t.tagged / t.days.size) : 0, target, expected, target_pct: targetPct,
      reviewed: r.reviewed, corrected: r.corrected, correction_rate: r.reviewed ? Math.round((r.corrected / r.reviewed) * 100) : null, accuracy_pct: accuracyPct,
      fields: r.fields, grade_low: r.grade_low, grade_high: r.grade_high, price_impact: r.rupees, under_priced: under.get(id) ?? 0, rejects: t.rejects, manual_prices: t.manual,
      score, finalised: f ? { score: f.score, note: f.note, at: f.finalised_at, by: name.get(f.finalised_by ?? 0) ?? "" } : null, recent: r.recent,
    };
  }).sort((a, b) => b.score - a.score);
  return NextResponse.json({ month, weights: { target: W_TARGET, accuracy: W_ACCURACY }, default_target: defaultTarget, taggers });
}

export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { month?: string; staff_id?: number; note?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Body must be JSON." }, { status: 400 }); }
  if (!/^\d{4}-\d{2}$/.test(String(body.month)) || !Number.isInteger(body.staff_id)) return NextResponse.json({ error: "month and staff_id are required." }, { status: 400 });
  const res = await GET(new Request(`http://x/api/admin/taggers?month=${body.month}`));
  const j = await res.json();
  const t = (j.taggers as { id: number; score: number; target_pct: number; accuracy_pct: number | null; tagged: number; reviewed: number; corrected: number }[]).find((x) => x.id === body.staff_id);
  if (!t) return NextResponse.json({ error: "No activity for that tagger in that month." }, { status: 404 });
  const { error } = await gate.db.from("tagger_scores").upsert({ month: `${body.month}-01`, staff_id: t.id, score: t.score, target_pct: t.target_pct, accuracy_pct: t.accuracy_pct ?? 100, tagged: t.tagged, reviewed: t.reviewed, corrected: t.corrected, note: body.note?.trim() || null, finalised_by: gate.staff.id, finalised_at: new Date().toISOString() }, { onConflict: "month,staff_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, score: t.score });
}
