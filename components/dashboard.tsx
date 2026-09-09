"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Data = {
  days: number;
  offline: {
    totals: { tagged: number; today: number; value: number; cost: number; rejects: number; reject_pct: number; awaiting_floor: number; on_floor: number; in_transit: number };
    by_day: { day: string; n: number }[];
    taggers: { name: string; tagged: number; today: number; per_day: number; rejects: number; above_pct: number; below_pct: number; balance_flag: boolean; under_priced: number; value: number }[];
    alerts: { id: number; sku: string; tagger: string; standard_price: number; final_price: number; pct_below: number; kind: string; reason: string | null; created_at: string }[];
    grade_mix: Record<string, number>;
    outlets: { id: number | null; name: string; tagged: number; awaiting_floor: number; on_floor: number; on_floor_value: number; sold: number; pulled: number; colours: Record<string, number> }[];
    transfers: { id: number; code: string; to_outlet: string; status: string; created_by: string; created_at: string; sent_at: string | null; received_at: string | null; pieces: number; skus: string[]; transit_hours: number | null; note: string | null }[];
    lots: { open: number; closed: number };
    recent: { sku: string; tagged_at: string; tagger: string; sub_category: string; grade: string; price: number; outlet: string; status: string }[];
  };
  online: {
    totals: { items: number; draft: number; ready: number; listed: number; unlisted: number; listed_value: number; no_photos: number; errors: number };
    recent: { sku: string; tagged_at: string; tagger: string; sub_category: string; price: number; online_status: string | null; photos: number; synced_at: string | null; error: string | null }[];
  };
};

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const ASSUMED: Record<string, number> = { bnwt: 0.02, premium: 0.65, excellent: 0.2, very_good: 0.1, rejected: 0.03 };
const COLOUR: Record<string, string> = { red: "bg-red-500", blue: "bg-blue-500", green: "bg-green-500", yellow: "bg-yellow-400" };

export function Dashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTransfer, setOpenTransfer] = useState<number | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/dashboard?days=${days}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); }).catch((e) => setError(e.message));
  }, [days]);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!data) return <p className="text-muted-foreground">Loading…</p>;
  const o = data.offline, n = data.online;
  const maxDay = Math.max(1, ...o.by_day.map((d) => d.n));
  const gradeTotal = Object.values(o.grade_mix).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="text-sm text-muted-foreground">Everything tagged, where it went, and what&apos;s online.</p></div>
        <div className="flex gap-1 rounded-md border p-1 text-sm">{[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={cn("rounded px-3 py-1", days === d ? "bg-foreground text-background" : "hover:bg-muted")}>{d} days</button>)}</div>
      </div>

      <ExportCard />

      <Tabs defaultValue="offline">
        <TabsList><TabsTrigger value="offline">Offline · outlets</TabsTrigger><TabsTrigger value="online">Online · Shopify</TabsTrigger></TabsList>

        <TabsContent value="offline" className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label={`Tagged · ${days}d`} value={o.totals.tagged.toLocaleString()} sub={`${o.totals.today} today`} />
            <Stat label="List value" value={rs(o.totals.value)} sub={`cost ${rs(o.totals.cost)}`} />
            <Stat label="Rejects" value={`${o.totals.rejects}`} sub={`${pct(o.totals.reject_pct)} vs 3% assumed`} tone={o.totals.reject_pct > 0.03 ? "warn" : undefined} />
            <Stat label="Awaiting drop day" value={String(o.totals.awaiting_floor)} />
            <Stat label="In transit" value={String(o.totals.in_transit)} sub="pieces on sent transfers" />
            <Stat label="On floor" value={String(o.totals.on_floor)} sub={`${o.lots.open} open lots`} />
          </div>

          <Card className={cn(o.alerts.length > 0 && "border-amber-500")}>
            <CardHeader className="pb-2"><CardTitle className="text-base">Priced below the sheet · {o.alerts.length} in {days} days</CardTitle></CardHeader>
            <CardContent>
              {o.alerts.length === 0 ? <p className="text-sm text-muted-foreground">No garment has been priced below the pricing sheet in this period.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">When</th><th className="pb-2">Tagger</th><th className="pb-2">SKU</th><th className="pb-2 text-right">Sheet</th><th className="pb-2 text-right">Priced</th><th className="pb-2 text-right">Below</th><th className="pb-2">How</th><th className="pb-2">Reason given</th></tr></thead>
                  <tbody className="divide-y">{o.alerts.map((a) => (
                    <tr key={a.id}><td className="py-1.5 text-xs">{when(a.created_at)}</td><td className="py-1.5 font-medium">{a.tagger}</td><td className="py-1.5 font-mono text-xs"><a href={`/items/${a.sku}`} className="hover:underline">{a.sku}</a></td><td className="py-1.5 text-right tabular-nums">{rs(a.standard_price)}</td><td className="py-1.5 text-right tabular-nums">{rs(a.final_price)}</td><td className="py-1.5 text-right font-semibold tabular-nums text-red-700 dark:text-red-400">{a.pct_below.toFixed(0)}%</td><td className="py-1.5 text-xs">{a.kind === "manual" ? "by hand" : "− steps"}</td><td className="py-1.5 text-xs">{a.reason ?? "—"}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Every save below the pricing-sheet price at that grade lands here with the tagger&apos;s name and their reason. A tagger who keeps appearing is worth a conversation.</p>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Tagged per day</CardTitle></CardHeader>
              <CardContent>
                <div className="flex h-36 items-end gap-[2px]">
                  {o.by_day.map((d) => <div key={d.day} title={`${d.day}: ${d.n}`} className="flex-1 rounded-t bg-foreground/80" style={{ height: `${(d.n / maxDay) * 100}%`, minHeight: d.n ? 2 : 0 }} />)}
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{o.by_day[0]?.day}</span><span>{o.by_day.at(-1)?.day}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Grade mix vs assumed</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {Object.keys(ASSUMED).map((g) => { const actual = (o.grade_mix[g] ?? 0) / gradeTotal; return (
                  <div key={g}><div className="flex justify-between"><span>{GRADE[g]}</span><span className="tabular-nums">{pct(actual)} <span className="text-muted-foreground">/ {pct(ASSUMED[g])}</span></span></div>
                  <div className="h-1.5 rounded bg-muted"><div className={cn("h-1.5 rounded", g === "rejected" ? "bg-red-500" : "bg-foreground/70")} style={{ width: `${Math.min(100, actual * 100)}%` }} /></div></div>); })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">By tagger</CardTitle></CardHeader>
            <CardContent>
              {o.taggers.length === 0 ? <p className="text-sm text-muted-foreground">Nothing tagged in this period.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Tagger</th><th className="pb-2 text-right">Tagged</th><th className="pb-2 text-right">Today</th><th className="pb-2 text-right">Per day</th><th className="pb-2 text-right">Rejects</th><th className="pb-2 text-right">Above</th><th className="pb-2 text-right">Below</th><th className="pb-2 text-right">Under-priced</th><th className="pb-2 text-right">List value</th></tr></thead>
                  <tbody className="divide-y">{o.taggers.map((t) => (
                    <tr key={t.name} className={cn(t.balance_flag && "bg-amber-50 dark:bg-amber-950/40")}>
                      <td className="py-1.5">{t.name}{t.balance_flag && <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">adjustment drift</span>}</td>
                      <td className="py-1.5 text-right tabular-nums">{t.tagged}</td><td className="py-1.5 text-right tabular-nums">{t.today}</td><td className="py-1.5 text-right tabular-nums">{t.per_day}</td><td className="py-1.5 text-right tabular-nums">{t.rejects}</td>
                      <td className="py-1.5 text-right tabular-nums">{pct(t.above_pct)}</td><td className="py-1.5 text-right tabular-nums">{pct(t.below_pct)}</td><td className={cn("py-1.5 text-right tabular-nums", t.under_priced > 0 && "font-semibold text-red-700 dark:text-red-400")}>{t.under_priced}</td><td className="py-1.5 text-right tabular-nums">{rs(t.value)}</td>
                    </tr>))}</tbody>
                </table></div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Above and Below should each stay under 15% and roughly balance — one-sided drift toward Below quietly costs margin.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Stock by outlet</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Outlet</th><th className="pb-2 text-right">Tagged for</th><th className="pb-2 text-right">Awaiting floor</th><th className="pb-2 text-right">On floor</th><th className="pb-2 text-right">Floor value</th><th className="pb-2">By colour</th><th className="pb-2 text-right">Sold</th><th className="pb-2 text-right">Pulled</th></tr></thead>
              <tbody className="divide-y">{o.outlets.map((x) => (
                <tr key={String(x.id)}><td className="py-1.5">{x.name}</td><td className="py-1.5 text-right tabular-nums">{x.tagged}</td><td className="py-1.5 text-right tabular-nums">{x.awaiting_floor}</td><td className="py-1.5 text-right tabular-nums">{x.on_floor}</td><td className="py-1.5 text-right tabular-nums">{rs(x.on_floor_value)}</td>
                <td className="py-1.5"><span className="flex gap-2">{Object.entries(x.colours).map(([c, k]) => <span key={c} className="flex items-center gap-1 text-xs"><span className={cn("inline-block size-2.5 rounded-full", COLOUR[c])} />{k}</span>)}</span></td>
                <td className="py-1.5 text-right tabular-nums">{x.sold}</td><td className="py-1.5 text-right tabular-nums">{x.pulled}</td></tr>))}</tbody>
            </table></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Shipments</CardTitle></CardHeader>
            <CardContent>
              {o.transfers.length === 0 ? <p className="text-sm text-muted-foreground">No transfers yet.</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Transfer</th><th className="pb-2">To</th><th className="pb-2 text-right">Pieces</th><th className="pb-2">Status</th><th className="pb-2">Created</th><th className="pb-2">Dispatched</th><th className="pb-2">Received</th><th className="pb-2 text-right">Transit</th></tr></thead>
                  <tbody className="divide-y">{o.transfers.map((t) => (<>
                    <tr key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenTransfer(openTransfer === t.id ? null : t.id)}>
                      <td className="py-1.5 font-mono text-xs">{t.code}<div className="font-sans text-muted-foreground">{t.created_by}</div></td><td className="py-1.5">{t.to_outlet}</td><td className="py-1.5 text-right tabular-nums">{t.pieces}</td>
                      <td className="py-1.5"><span className={cn("rounded-full border px-2 py-0.5 text-xs capitalize", t.status === "received" && "border-green-600 text-green-700 dark:text-green-400", t.status === "sent" && "border-amber-600 text-amber-700 dark:text-amber-400")}>{t.status}</span></td>
                      <td className="py-1.5 text-xs">{when(t.created_at)}</td><td className="py-1.5 text-xs">{when(t.sent_at)}</td><td className="py-1.5 text-xs">{when(t.received_at)}</td><td className="py-1.5 text-right text-xs tabular-nums">{t.transit_hours != null ? `${t.transit_hours} h` : "—"}</td>
                    </tr>
                    {openTransfer === t.id && <tr key={`${t.id}-skus`}><td colSpan={8} className="bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed">{t.skus.join("  ")}{t.note && <div className="mt-1 font-sans text-muted-foreground">{t.note}</div>}</td></tr>}
                  </>))}</tbody>
                </table></div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Tap a row to see every SKU on the shipment.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Latest tagged</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">When</th><th className="pb-2">SKU</th><th className="pb-2">Tagger</th><th className="pb-2">Garment</th><th className="pb-2">Grade</th><th className="pb-2">Outlet</th><th className="pb-2 text-right">Price</th></tr></thead>
              <tbody className="divide-y">{o.recent.map((r) => <tr key={r.sku}><td className="py-1 text-xs">{when(r.tagged_at)}</td><td className="py-1 font-mono text-xs"><a href={`/items/${r.sku}`} className="hover:underline">{r.sku}</a></td><td className="py-1">{r.tagger}</td><td className="py-1">{r.sub_category}</td><td className="py-1">{GRADE[r.grade] ?? r.grade}</td><td className="py-1">{r.outlet || "—"}</td><td className="py-1 text-right tabular-nums">{r.price ? rs(r.price) : "—"}</td></tr>)}</tbody>
            </table></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="online" className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="For online" value={String(n.totals.items)} sub={`${days} days`} />
            <Stat label="Draft" value={String(n.totals.draft)} sub="tagged, no cut-out yet" />
            <Stat label="Ready" value={String(n.totals.ready)} sub="photographed, not listed" />
            <Stat label="Listed" value={String(n.totals.listed)} sub={rs(n.totals.listed_value)} />
            <Stat label="No photos" value={String(n.totals.no_photos)} tone={n.totals.no_photos ? "warn" : undefined} />
            <Stat label="Shopify errors" value={String(n.totals.errors)} tone={n.totals.errors ? "warn" : undefined} />
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Online pipeline</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {n.recent.length === 0 ? <p className="text-sm text-muted-foreground">Nothing tagged for the online store in this period. This side is parked until the offline system is perfect.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">When</th><th className="pb-2">SKU</th><th className="pb-2">Tagger</th><th className="pb-2">Garment</th><th className="pb-2 text-right">Price</th><th className="pb-2 text-right">Photos</th><th className="pb-2">Status</th><th className="pb-2">Synced</th></tr></thead>
                  <tbody className="divide-y">{n.recent.map((r) => <tr key={r.sku}><td className="py-1 text-xs">{when(r.tagged_at)}</td><td className="py-1 font-mono text-xs"><a href={`/items/${r.sku}`} className="hover:underline">{r.sku}</a></td><td className="py-1">{r.tagger}</td><td className="py-1">{r.sub_category}</td><td className="py-1 text-right tabular-nums">{rs(r.price)}</td><td className="py-1 text-right tabular-nums">{r.photos}</td><td className="py-1 capitalize">{r.online_status ?? "draft"}{r.error && <span className="ml-1 text-xs text-red-700">error</span>}</td><td className="py-1 text-xs">{when(r.synced_at)}</td></tr>)}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExportCard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setFrom(today.slice(0, 8) + "01");
    setTo(today);
  }, []);
  const link = (what: string, format: "xlsx" | "csv") => `/api/export?what=${what}&format=${format}${what === "items" ? `&from=${from}&to=${to}` : ""}`;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Export</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1 text-xs text-muted-foreground">Tagged from<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">to<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" /></label>
        <a href={link("items", "xlsx")} className="rounded-md bg-foreground px-3 py-2 font-medium text-background">Items · Excel</a>
        <a href={link("items", "csv")} className="rounded-md border px-3 py-2">Items · CSV</a>
        <a href={link("transfers", "xlsx")} className="rounded-md border px-3 py-2">Shipments · Excel</a>
        <a href={link("lots", "xlsx")} className="rounded-md border px-3 py-2">Lots · Excel</a>
        <span className="text-xs text-muted-foreground">Items: every field on the tag plus tagger, lot, outlet, shipment, dispatched and received dates. Times are Pakistan time.</span>
      </CardContent>
    </Card>
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
