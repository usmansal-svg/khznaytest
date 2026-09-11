"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tagger = { id: number; name: string; tagged: number; today: number; week: number; per_day: number; days_active: number; secs_per_garment: number | null; premium_pct: number; rejects: number; reject_pct: number; avg_adjust: number; above_pct: number; below_pct: number; balance_flag: boolean; under_priced: number; manual_prices: number; no_photo: number; value: number; last_tagged: string | null; target: number; rare_pct: number; accuracy: { n: number; agree: number; low: number; high: number; rupees_low: number } | null };
type Data = {
  days: number;
  kpis: { today: number; week: number; period: number; per_hour_today: number | null; value: number; cost: number; expected_gp: number; gp_pct: number; rejects: number; reject_pct: number; awaiting_floor: number; in_transit: number; on_floor: number; active_taggers_today: number };
  attention: { under_priced: number; new_brands: { name: string; by: string; at: string }[]; no_photo: number; lots_nearly_done: string[]; set_aside: number; qc_held: number };
  by_day: { day: string; n: number; value: number }[];
  taggers: Tagger[];
  grade_mix: Record<string, number>;
  categories: { name: string; n: number; value: number }[];
  genders: { gender: string; n: number }[];
  outlets: { id: number | null; name: string; tagged: number; awaiting_floor: number; on_floor: number; on_floor_value: number; sold: number; pulled: number; colours: Record<string, number> }[];
  transfers: { id: number; code: string; to_outlet: string; status: string; created_by: string; created_at: string; sent_at: string | null; received_at: string | null; pieces: number; skus: string[]; transit_hours: number | null; note: string | null }[];
  lots: { code: string; supplier: string; description: string | null; basis: string; bought: number; used: number; pieces: number; pct_done: number | null }[];
  alerts: { id: number; sku: string; tagger: string; standard_price: number; final_price: number; pct_below: number; kind: string; reason: string | null; created_at: string }[];
  recent: { sku: string; tagged_at: string; tagger: string; sub_category: string; grade: string; price: number; photos: number; status: string }[];
  grading: { total: number; agree: number; low: number; high: number; rupees_low: number; physical: number; photo: number; recent: { sku: string; tagger: string; by: string; at: string; original: string; audit: string; dir: string; method: string; delta: number }[] };
  online: { totals: { items: number; draft: number; ready: number; listed: number; unlisted: number; listed_value: number; no_photos: number; errors: number } };
};

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const secs = (s: number | null) => (s == null ? "—" : s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const ASSUMED: Record<string, number> = { bnwt: 0.02, premium: 0.65, excellent: 0.2, very_good: 0.1, rejected: 0.03 };
const COLOUR: Record<string, string> = { red: "bg-red-500", blue: "bg-blue-500", green: "bg-green-500", yellow: "bg-yellow-400" };

export function Dashboard() {
  const [days, setDays] = useState(30);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [rangeDraft, setRangeDraft] = useState({ from: "", to: "" });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTransfer, setOpenTransfer] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setFrom(today.slice(0, 8) + "01");
    setTo(today);
  }, []);
  useEffect(() => {
    setData(null);
    const qs = range ? `from=${range.from}&to=${range.to}` : `days=${days}`;
    fetch(`/api/dashboard?${qs}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); }).catch((e) => setError(e.message));
  }, [days, range]);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  const k = data.kpis, a = data.attention;
  const maxDay = Math.max(1, ...data.by_day.map((d) => d.n));
  const gradeTotal = Object.values(data.grade_mix).reduce((x, y) => x + y, 0) || 1;
  const attentionItems = [
    a.under_priced > 0 && { text: `${a.under_priced} garment${a.under_priced === 1 ? "" : "s"} priced below the sheet`, href: "#alerts", tone: "warn" as const },
    a.new_brands.length > 0 && { text: `${a.new_brands.length} new brand${a.new_brands.length === 1 ? "" : "s"} from taggers need a tier`, href: "/admin/brands", tone: "warn" as const },
    a.no_photo > 0 && { text: `${a.no_photo} garment${a.no_photo === 1 ? "" : "s"} without a photo`, href: "/items", tone: "warn" as const },
    a.qc_held > 0 && { text: `${a.qc_held} garment${a.qc_held === 1 ? "" : "s"} on the QC rail waiting for a regrade`, href: "/qc", tone: "warn" as const },
    a.lots_nearly_done.length > 0 && { text: `Lots nearly finished: ${a.lots_nearly_done.join(", ")} — time to close and true-up`, href: "/lots", tone: "info" as const },
    k.awaiting_floor > 0 && { text: `${k.awaiting_floor} tagged garments not yet on a transfer`, href: "/transfers", tone: "info" as const },
  ].filter(Boolean) as { text: string; href: string; tone: "warn" | "info" }[];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="text-sm text-muted-foreground">How much, how fast, who, what it&apos;s worth, where it is, and what needs you.</p></div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex gap-1 rounded-md border p-1">{[7, 30, 90].map((d) => <button key={d} onClick={() => { setRange(null); setDays(d); }} className={cn("rounded px-3 py-1", !range && days === d ? "bg-foreground text-background" : "hover:bg-muted")}>{d} days</button>)}</div>
          <form className="flex items-center gap-1 rounded-md border p-1" onSubmit={(e) => { e.preventDefault(); if (rangeDraft.from && rangeDraft.to) setRange(rangeDraft.from <= rangeDraft.to ? { ...rangeDraft } : { from: rangeDraft.to, to: rangeDraft.from }); }}>
            <input type="date" value={rangeDraft.from} onChange={(e) => setRangeDraft({ ...rangeDraft, from: e.target.value })} className="h-8 rounded bg-transparent px-1 text-sm" aria-label="From" />
            <span className="text-muted-foreground">→</span>
            <input type="date" value={rangeDraft.to} onChange={(e) => setRangeDraft({ ...rangeDraft, to: e.target.value })} className="h-8 rounded bg-transparent px-1 text-sm" aria-label="To" />
            <button type="submit" disabled={!rangeDraft.from || !rangeDraft.to} className={cn("rounded px-3 py-1", range ? "bg-foreground text-background" : "hover:bg-muted disabled:opacity-50")}>Apply</button>
          </form>
        </div>
      </div>
      {range && <p className="text-xs text-muted-foreground">Showing {range.from} → {range.to} inclusive ({data.days} day{data.days === 1 ? "" : "s"}). &quot;Today&quot; and &quot;this week&quot; still mean the actual calendar.</p>}

      {/* ------------------------------------------------------- KPIs */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Tagged today" value={String(k.today)} sub={`${k.active_taggers_today} tagger${k.active_taggers_today === 1 ? "" : "s"} active`} />
        <Stat label="This week" value={String(k.week)} sub={range ? `${k.period} in the range` : `${k.period} in ${days} days`} />
        <Stat label="Pieces per hour today" value={k.per_hour_today != null ? String(k.per_hour_today) : "—"} sub="of active tagging time" />
        <Stat label="List value" value={rs(k.value)} sub={`cost ${rs(k.cost)}`} />
        <Stat label="Expected gross profit" value={rs(k.expected_gp)} sub={`${pct(k.gp_pct)} of ex-tax revenue`} />
        <Stat label="Rejects" value={String(k.rejects)} sub={`${(k.reject_pct * 100).toFixed(1)}% vs 3% assumed`} tone={k.reject_pct > 0.03 ? "warn" : undefined} />
      </div>

      {/* --------------------------------------------------- attention */}
      <Card className={cn(attentionItems.some((i) => i.tone === "warn") && "border-amber-500")}>
        <CardHeader className="pb-2"><CardTitle className="text-base">Needs your attention</CardTitle></CardHeader>
        <CardContent>
          {attentionItems.length === 0 ? <p className="text-sm text-muted-foreground">Nothing outstanding.</p> : (
            <ul className="grid gap-2 sm:grid-cols-2">{attentionItems.map((i) => <li key={i.text}><a href={i.href} className={cn("block rounded-md border px-3 py-2 text-sm hover:bg-muted", i.tone === "warn" ? "border-amber-500" : "")}>{i.text} →</a></li>)}</ul>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ tagger table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Tagger performance · {range ? `${range.from} → ${range.to}` : `${days} days`}</CardTitle></CardHeader>
        <CardContent>
          {data.taggers.length === 0 ? <p className="text-sm text-muted-foreground">Nothing tagged in this period.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr>
                <th className="pb-2">Tagger</th><th className="pb-2 text-right">Tagged</th><th className="pb-2">Today vs target</th><th className="pb-2 text-right">Per day</th><th className="pb-2 text-right">Per garment</th><th className="pb-2 text-right">Grading</th>
                <th className="pb-2 text-right">Premium+</th><th className="pb-2 text-right">Rejects</th><th className="pb-2 text-right">Avg adj.</th><th className="pb-2 text-right">Under-priced</th><th className="pb-2 text-right">By hand</th><th className="pb-2 text-right">Rare</th><th className="pb-2 text-right">No photo</th><th className="pb-2 text-right">Value</th><th className="pb-2">Last</th>
              </tr></thead>
              <tbody className="divide-y">{data.taggers.map((t) => (
                <tr key={t.id} className={cn((t.balance_flag || t.under_priced > 0) && "bg-amber-50/60 dark:bg-amber-950/30")}>
                  <td className="py-1.5 font-medium">{t.name}<div className="text-xs font-normal text-muted-foreground">{t.days_active} day{t.days_active === 1 ? "" : "s"} active</div></td>
                  <td className="py-1.5 text-right tabular-nums">{t.tagged}</td>
                  <td className="py-1.5"><div className="flex items-center gap-2"><span className="tabular-nums">{t.today} / {t.target}</span><div className="h-1.5 w-20 rounded bg-muted"><div className={cn("h-1.5 rounded", t.today >= t.target ? "bg-green-600" : "bg-foreground/70")} style={{ width: `${Math.min(100, (t.today / Math.max(1, t.target)) * 100)}%` }} /></div></div></td>
                  <td className="py-1.5 text-right tabular-nums">{t.per_day}</td>
                  <td className="py-1.5 text-right tabular-nums">{secs(t.secs_per_garment)}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", t.accuracy && t.accuracy.low / Math.max(1, t.accuracy.n) > 0.1 && "font-semibold text-amber-700 dark:text-amber-300")}>{t.accuracy ? `${pct(t.accuracy.agree / t.accuracy.n)} · ${t.accuracy.low}↓` : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{pct(t.premium_pct)}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", t.reject_pct > 0.05 && "text-red-700 dark:text-red-400")}>{t.rejects} <span className="text-xs text-muted-foreground">{pct(t.reject_pct)}</span></td>
                  <td className={cn("py-1.5 text-right tabular-nums", t.balance_flag && "font-semibold text-amber-700 dark:text-amber-300")}>{t.avg_adjust > 0 ? "+" : ""}{t.avg_adjust.toFixed(1)}%</td>
                  <td className={cn("py-1.5 text-right tabular-nums", t.under_priced > 0 && "font-semibold text-red-700 dark:text-red-400")}>{t.under_priced}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.manual_prices}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", t.rare_pct > 0.03 && "font-semibold text-amber-700 dark:text-amber-300")}>{pct(t.rare_pct)}</td>
                  <td className={cn("py-1.5 text-right tabular-nums", t.no_photo > 0 && "text-amber-700 dark:text-amber-300")}>{t.no_photo}</td>
                  <td className="py-1.5 text-right tabular-nums">{rs(t.value)}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{when(t.last_tagged)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Grading is the QC agreement rate with the number graded too low (↓) beside it. Per garment is the median time between a tagger&apos;s saves. Premium+ is the share graded Premium or BNWT — a low share against the others may mean downgrading (the safe error). Avg adj. drifting negative, under-priced counts and by-hand prices are the things to ask about.</p>
        </CardContent>
      </Card>

      {/* ---------------------------------------------- trend + mix */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Tagged per day</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-[2px]">{data.by_day.map((d) => <div key={d.day} title={`${d.day}: ${d.n} · ${rs(d.value)}`} className="flex-1 rounded-t bg-foreground/80" style={{ height: `${(d.n / maxDay) * 100}%`, minHeight: d.n ? 2 : 0 }} />)}</div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{data.by_day[0]?.day}</span><span>best day {maxDay}</span><span>{data.by_day.at(-1)?.day}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Grade mix vs assumed</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.keys(ASSUMED).map((g) => { const actual = (data.grade_mix[g] ?? 0) / gradeTotal; return (
              <div key={g}><div className="flex justify-between"><span>{GRADE[g]}</span><span className="tabular-nums">{pct(actual)} <span className="text-muted-foreground">/ {pct(ASSUMED[g])}</span></span></div>
              <div className="h-1.5 rounded bg-muted"><div className={cn("h-1.5 rounded", g === "rejected" ? "bg-red-500" : "bg-foreground/70")} style={{ width: `${Math.min(100, actual * 100)}%` }} /></div></div>); })}
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------- lots + categories */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Open lots · progress</CardTitle></CardHeader>
          <CardContent>
            {data.lots.length === 0 ? <p className="text-sm text-muted-foreground">No open lots.</p> : (
              <ul className="space-y-2 text-sm">{data.lots.map((l) => (
                <li key={l.code}><div className="flex justify-between"><span><span className="font-mono text-xs">{l.code}</span> {l.description ? <span className="text-muted-foreground">· {l.description}</span> : <span className="text-muted-foreground">· {l.supplier}</span>}</span><span className="tabular-nums">{l.pieces} pcs · {l.pct_done == null ? "—" : pct(l.pct_done)}</span></div>
                <div className="mt-1 h-1.5 rounded bg-muted"><div className={cn("h-1.5 rounded", (l.pct_done ?? 0) >= 0.85 ? "bg-amber-500" : "bg-foreground/70")} style={{ width: `${Math.min(100, (l.pct_done ?? 0) * 100)}%` }} /></div></li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">What&apos;s being tagged</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">{data.genders.map((g) => <span key={g.gender} className="rounded-full border px-2 py-0.5 capitalize">{g.gender} · {g.n}</span>)}</div>
            <table className="w-full text-sm"><tbody className="divide-y">{data.categories.map((c) => <tr key={c.name}><td className="py-1 capitalize">{c.name}</td><td className="py-1 text-right tabular-nums">{c.n}</td><td className="py-1 text-right tabular-nums text-muted-foreground">{rs(c.value)}</td></tr>)}</tbody></table>
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------- grading accuracy */}
      <Card className={cn(data.grading.low > 0 && "border-amber-500")}>
        <CardHeader className="pb-2"><CardTitle className="text-base">Grading accuracy · QC regrades</CardTitle></CardHeader>
        <CardContent>
          {data.grading.total === 0 ? <p className="text-sm text-muted-foreground">No QC regrades in this period. Garments are held at random as they are tagged; a senior regrades them blind from the QC screen.</p> : (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-5">
                <Stat label="Regraded" value={String(data.grading.total)} sub={`${data.grading.physical} in hand · ${data.grading.photo} by photo`} />
                <Stat label="Agreed" value={pct(data.grading.agree / data.grading.total)} />
                <Stat label="Tagger too low" value={String(data.grading.low)} sub="the costly direction" tone={data.grading.low / data.grading.total > 0.1 ? "warn" : undefined} />
                <Stat label="Tagger too high" value={String(data.grading.high)} />
                <Stat label="Lost to downgrading" value={rs(data.grading.rupees_low)} sub="in the sample alone" tone={data.grading.rupees_low > 0 ? "warn" : undefined} />
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">When</th><th className="pb-2">SKU</th><th className="pb-2">Tagger</th><th className="pb-2">Tagger said</th><th className="pb-2">Senior said</th><th className="pb-2">By</th><th className="pb-2 text-right">Δ price</th></tr></thead>
                <tbody className="divide-y">{data.grading.recent.map((g, i) => <tr key={i} className={cn(g.dir === "low" && "bg-amber-50/60 dark:bg-amber-950/30")}><td className="py-1 text-xs">{when(g.at)}</td><td className="py-1 font-mono text-xs"><a href={`/items/${g.sku}`} className="hover:underline">{g.sku}</a></td><td className="py-1">{g.tagger}</td><td className="py-1">{GRADE[g.original]}</td><td className="py-1 font-medium">{GRADE[g.audit]}{g.dir === "agree" && <span className="ml-1 text-xs text-green-700">✓</span>}</td><td className="py-1 text-xs">{g.by} · {g.method}</td><td className={cn("py-1 text-right tabular-nums", g.delta > 0 && "text-amber-700 dark:text-amber-300")}>{g.delta ? (g.delta > 0 ? "+" : "") + rs(g.delta).replace("Rs ", "") : "—"}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------- alerts */}
      <Card id="alerts" className={cn(data.alerts.length > 0 && "border-amber-500")}>
        <CardHeader className="pb-2"><CardTitle className="text-base">Priced below the sheet · {data.alerts.length}</CardTitle></CardHeader>
        <CardContent>
          {data.alerts.length === 0 ? <p className="text-sm text-muted-foreground">None in this period.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">When</th><th className="pb-2">Tagger</th><th className="pb-2">SKU</th><th className="pb-2 text-right">Sheet</th><th className="pb-2 text-right">Priced</th><th className="pb-2 text-right">Below</th><th className="pb-2">How</th><th className="pb-2">Reason given</th></tr></thead>
              <tbody className="divide-y">{data.alerts.map((x) => <tr key={x.id}><td className="py-1.5 text-xs">{when(x.created_at)}</td><td className="py-1.5 font-medium">{x.tagger}</td><td className="py-1.5 font-mono text-xs"><a href={`/items/${x.sku}`} className="hover:underline">{x.sku}</a></td><td className="py-1.5 text-right tabular-nums">{rs(x.standard_price)}</td><td className="py-1.5 text-right tabular-nums">{rs(x.final_price)}</td><td className="py-1.5 text-right font-semibold tabular-nums text-red-700 dark:text-red-400">{x.pct_below.toFixed(0)}%</td><td className="py-1.5 text-xs">{x.kind === "manual" ? "by hand" : "− steps"}</td><td className="py-1.5 text-xs">{x.reason ?? "—"}</td></tr>)}</tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------- outlets + shipments */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Where the stock is</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Outlet</th><th className="pb-2 text-right">Tagged for</th><th className="pb-2 text-right">Awaiting floor</th><th className="pb-2 text-right">On floor</th><th className="pb-2 text-right">Floor value</th><th className="pb-2">By colour</th><th className="pb-2 text-right">Sold</th><th className="pb-2 text-right">Pulled</th></tr></thead>
          <tbody className="divide-y">{data.outlets.map((x) => (
            <tr key={String(x.id)}><td className="py-1.5">{x.name}</td><td className="py-1.5 text-right tabular-nums">{x.tagged}</td><td className="py-1.5 text-right tabular-nums">{x.awaiting_floor}</td><td className="py-1.5 text-right tabular-nums">{x.on_floor}</td><td className="py-1.5 text-right tabular-nums">{rs(x.on_floor_value)}</td>
            <td className="py-1.5"><span className="flex gap-2">{Object.entries(x.colours).map(([c, n]) => <span key={c} className="flex items-center gap-1 text-xs"><span className={cn("inline-block size-2.5 rounded-full", COLOUR[c])} />{n}</span>)}</span></td>
            <td className="py-1.5 text-right tabular-nums">{x.sold}</td><td className="py-1.5 text-right tabular-nums">{x.pulled}</td></tr>))}</tbody>
        </table></CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Shipments</CardTitle></CardHeader>
        <CardContent>
          {data.transfers.length === 0 ? <p className="text-sm text-muted-foreground">No transfers yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Transfer</th><th className="pb-2">To</th><th className="pb-2 text-right">Pieces</th><th className="pb-2">Status</th><th className="pb-2">Created</th><th className="pb-2">Dispatched</th><th className="pb-2">Received</th><th className="pb-2 text-right">Transit</th></tr></thead>
              <tbody className="divide-y">{data.transfers.map((t) => (<>
                <tr key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenTransfer(openTransfer === t.id ? null : t.id)}>
                  <td className="py-1.5 font-mono text-xs">{t.code}<div className="font-sans text-muted-foreground">{t.created_by}</div></td><td className="py-1.5">{t.to_outlet}</td><td className="py-1.5 text-right tabular-nums">{t.pieces}</td>
                  <td className="py-1.5"><span className={cn("rounded-full border px-2 py-0.5 text-xs capitalize", t.status === "received" && "border-green-600 text-green-700 dark:text-green-400", t.status === "sent" && "border-amber-600 text-amber-700 dark:text-amber-400")}>{t.status}</span></td>
                  <td className="py-1.5 text-xs">{when(t.created_at)}</td><td className="py-1.5 text-xs">{when(t.sent_at)}</td><td className="py-1.5 text-xs">{when(t.received_at)}</td><td className="py-1.5 text-right text-xs tabular-nums">{t.transit_hours != null ? `${t.transit_hours} h` : "—"}</td>
                </tr>
                {openTransfer === t.id && <tr key={`${t.id}-skus`}><td colSpan={8} className="bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed">{t.skus.join("  ")}{t.note && <div className="mt-1 font-sans text-muted-foreground">{t.note}</div>}</td></tr>}
              </>))}</tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------ recent + export */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Latest tagged</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">When</th><th className="pb-2">SKU</th><th className="pb-2">Tagger</th><th className="pb-2">Garment</th><th className="pb-2">Grade</th><th className="pb-2 text-right">Price</th><th className="pb-2 text-right">Photo</th></tr></thead>
            <tbody className="divide-y">{data.recent.map((r) => <tr key={r.sku}><td className="py-1 text-xs">{when(r.tagged_at)}</td><td className="py-1 font-mono text-xs"><a href={`/items/${r.sku}`} className="hover:underline">{r.sku}</a></td><td className="py-1">{r.tagger}</td><td className="py-1">{r.sub_category}</td><td className="py-1">{GRADE[r.grade] ?? r.grade}</td><td className="py-1 text-right tabular-nums">{r.price ? rs(r.price) : "—"}</td><td className={cn("py-1 text-right", r.photos === 0 && r.grade !== "rejected" && "text-amber-700")}>{r.photos ? "✓" : "—"}</td></tr>)}</tbody>
          </table></CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader className="pb-2"><CardTitle className="text-base">Export</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <label className="grid gap-1 text-xs text-muted-foreground">Tagged from<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">to<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" /></label>
            <a href={`/api/export?what=items&format=xlsx&from=${from}&to=${to}`} className="rounded-md bg-foreground px-3 py-2 text-center font-medium text-background">Items · Excel</a>
            <a href={`/api/export?what=transfers&format=xlsx`} className="rounded-md border px-3 py-2 text-center">Shipments · Excel</a>
            <a href={`/api/export?what=lots&format=xlsx`} className="rounded-md border px-3 py-2 text-center">Lots · Excel</a>
            {data.online.totals.items > 0 && <p className="text-xs text-muted-foreground">Online: {data.online.totals.listed} listed · {data.online.totals.ready} ready · {data.online.totals.draft} draft</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className={cn("rounded-xl border bg-background p-4", tone === "warn" && "border-amber-500")}>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
