"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pkr, usePos } from "@/components/pos/pos-context";
import { STAGE_LABELS } from "@/lib/pos/pricing";
import { cn } from "@/lib/utils";

type Group = { sold: number; revenue: number; avg_sold: number; avg_list: number; realised_pct: number | null; gp_pct: number | null; median_days: number | null; stages: Record<string, number> };
type ST = { floored: number; sold: number; pulled: number; on_floor: number; sell_through_pct: number };
type Report = {
  outlets: { id: number; name: string }[];
  totals: { sold: number; revenue: number; list: number; cost: number; returns: number; refunds: number };
  by_grade: Record<string, Group>; by_profile: Record<string, Group>; by_sub_category: Record<string, Group>; by_outlet: Record<string, Group>;
  by_stage: Record<string, number>; by_day: Record<string, { revenue: number; sold: number }>;
  sell_through_by_grade: Record<string, ST>; sell_through_by_profile: Record<string, ST>; sell_through_by_sub_category: Record<string, ST>;
  assumed: { grades: Record<string, number>; profiles: Record<string, { full: number; md1: number; md2: number; md3: number; pulled: number }> };
};
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const PROFILE: Record<string, string> = { fast: "Fast", standard: "Standard", slow: "Slow" };

/**
 * The feedback loop into the pricing sheet: what sells, how fast, at what
 * price, and at which markdown — against what the sheet assumes.
 */
export function ReportsPage() {
  const { me } = usePos();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => { setTo(new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)); setFrom(new Date(Date.now() - 25 * 86400_000).toISOString().slice(0, 10)); }, []);
  const [outlet, setOutlet] = useState<string>("");
  const [r, setR] = useState<Report | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { if (!from || !to) return; const res = await fetch(`/api/pos/reports?from=${from}&to=${to}${outlet ? `&outlet=${outlet}` : ""}`); const j = await res.json(); if (res.ok) setR(j); else setMsg(j.error); }, [from, to, outlet]);
  useEffect(() => { void load(); }, [load]);
  if (me && !me.is_hq) return <p className="text-muted-foreground">Reports are for head office.</p>;
  const exTax = (v: number) => v / 1.05;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Sales reports</h1><p className="text-sm text-muted-foreground">What sells, how fast, at what price — the numbers to set the selling profiles and grade shares by.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-40" /><span className="text-muted-foreground">to</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-40" />
          <select value={outlet} onChange={(e) => setOutlet(e.target.value)} className="h-10 rounded-md border border-input bg-transparent px-2 text-sm"><option value="">All outlets</option>{r?.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </div>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      {r && (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Garments sold" value={String(r.totals.sold)} />
            <Stat label="Takings" value={pkr(r.totals.revenue)} sub="incl. tax" />
            <Stat label="Realised vs list" value={r.totals.list ? `${Math.round((r.totals.revenue / r.totals.list) * 100)}%` : "—"} sub={`list ${pkr(r.totals.list)}`} />
            <Stat label="Gross profit" value={r.totals.revenue ? `${Math.round(((exTax(r.totals.revenue) - r.totals.cost) / exTax(r.totals.revenue)) * 100)}%` : "—"} sub={`cost ${pkr(r.totals.cost)}`} />
            <Stat label="Avg sold price" value={r.totals.sold ? pkr(r.totals.revenue / r.totals.sold) : "—"} />
            <Stat label="Returns" value={String(r.totals.returns)} sub={pkr(r.totals.refunds)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Sold at which markdown <span className="font-normal text-muted-foreground">· against the profile assumptions</span></CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-1">Stage</th><th className="pb-1 text-right">Sold</th><th className="pb-1 text-right">Share</th><th className="pb-1 text-right">Assumed (Fast / Std / Slow)</th></tr></thead>
                  <tbody className="divide-y">{(["full", "md1", "md2", "md3"] as const).map((s) => { const n = r.by_stage[s] ?? 0; const tot = Object.values(r.by_stage).reduce((a, b) => a + b, 0); return <tr key={s}><td className="py-1">{STAGE_LABELS[s]}</td><td className="py-1 text-right tabular-nums">{n}</td><td className="py-1 text-right tabular-nums">{tot ? Math.round((n / tot) * 100) : 0}%</td><td className="py-1 text-right tabular-nums text-muted-foreground">{["fast", "standard", "slow"].map((p) => `${Math.round((r.assumed.profiles[p]?.[s] ?? 0) * 100)}%`).join(" / ")}</td></tr>; })}</tbody></table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">By condition</CardTitle></CardHeader>
              <CardContent><GroupTable rows={r.by_grade} label={(k) => GRADE[k] ?? k} st={r.sell_through_by_grade} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">By selling profile <span className="font-normal text-muted-foreground">· the biggest input to the multiple</span></CardTitle></CardHeader>
              <CardContent><GroupTable rows={r.by_profile} label={(k) => PROFILE[k] ?? k} st={r.sell_through_by_profile} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">By outlet</CardTitle></CardHeader>
              <CardContent><GroupTable rows={r.by_outlet} label={(k) => r.outlets.find((o) => String(o.id) === k)?.name ?? k} /></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">By sub-category <span className="font-normal text-muted-foreground">· sorted by garments sold</span></CardTitle></CardHeader>
            <CardContent className="overflow-x-auto"><GroupTable rows={r.by_sub_category} label={(k) => k} st={Object.fromEntries(Object.entries(r.sell_through_by_sub_category).map(([k, v]) => [k, v]))} stKey={(k) => k.split(" · ")[1] ?? k} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">By day</CardTitle></CardHeader>
            <CardContent><div className="flex h-32 items-end gap-1">{Object.entries(r.by_day).sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => { const max = Math.max(...Object.values(r.by_day).map((x) => x.revenue), 1); return <div key={d} title={`${d}: ${v.sold} sold, ${pkr(v.revenue)}`} className="flex-1 rounded-t bg-foreground/70" style={{ height: `${(v.revenue / max) * 100}%` }} />; })}</div></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function GroupTable({ rows, label, st, stKey }: { rows: Record<string, Group>; label: (k: string) => string; st?: Record<string, ST>; stKey?: (k: string) => string }) {
  const entries = Object.entries(rows).sort(([, a], [, b]) => b.sold - a.sold);
  if (!entries.length) return <p className="py-3 text-center text-sm text-muted-foreground">No sales in this range.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-1"></th><th className="pb-1 text-right">Sold</th><th className="pb-1 text-right">Avg sold</th><th className="pb-1 text-right">vs list</th><th className="pb-1 text-right">GP</th><th className="pb-1 text-right">Median days</th>{st && <th className="pb-1 text-right">Sell-through</th>}<th className="pb-1 text-right">Full / 25 / 50 / 75</th></tr></thead>
      <tbody className="divide-y">
        {entries.map(([k, g]) => { const s = st?.[stKey ? stKey(k) : k]; return (
          <tr key={k}><td className="py-1">{label(k)}</td><td className="py-1 text-right tabular-nums">{g.sold}</td><td className="py-1 text-right tabular-nums">{pkr(g.avg_sold)}</td><td className="py-1 text-right tabular-nums">{g.realised_pct != null ? `${g.realised_pct}%` : "—"}</td><td className={cn("py-1 text-right tabular-nums", g.gp_pct != null && g.gp_pct < 50 && "text-red-700 dark:text-red-400")}>{g.gp_pct != null ? `${g.gp_pct}%` : "—"}</td><td className="py-1 text-right tabular-nums">{g.median_days ?? "—"}</td>{st && <td className="py-1 text-right tabular-nums">{s ? `${s.sell_through_pct}% of ${s.floored}` : "—"}</td>}<td className="py-1 text-right tabular-nums text-muted-foreground">{["full", "md1", "md2", "md3"].map((x) => g.stages[x] ?? 0).join(" / ")}</td></tr>
        ); })}
      </tbody>
    </table>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-md border bg-background p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold tabular-nums">{value}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>;
}
