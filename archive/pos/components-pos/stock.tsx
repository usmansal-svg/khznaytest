"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pkr, usePos } from "@/components/pos/pos-context";
import { STAGE_LABELS } from "@/lib/pos/pricing";
import { cn } from "@/lib/utils";

type Row = { id: number; sku: string; brand: string | null; size: string | null; grade: string; sub_category: string; category: string; gender: string; list_price: number; stage: keyof typeof STAGE_LABELS; price: number; days: number | null; floored_on: string | null; colour: string | null; status: string; rare: boolean; online: boolean };
type Sweep = { current: string; stickers: { sku: string; brand: string; sub_category: string; size_label: string | null; list_price: number; stage: string; sticker: string; price_today: number }[]; toPull: { sku: string; brand: string; sub_category: string; size_label: string | null; list_price: number }[] };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good" };

/** What is on the floor here, how old it is, what it sells for today; and the monthly sweep (stickers and pulls). */
export function StockPage() {
  const { api, me } = usePos();
  const [tab, setTab] = useState<"stock" | "sweep">("stock");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ rows: Row[]; summary: { count: number; value: number; by_stage: Record<string, { count: number; value: number }> } } | null>(null);
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api(`/api/pos/stock${q ? `?q=${encodeURIComponent(q)}` : ""}`); const j = await r.json(); if (r.ok) setData(j); else setMsg(j.error);
  }, [api, q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (tab === "sweep") void api("/api/pos/sweep").then(async (r) => { const j = await r.json(); if (r.ok) setSweep(j); else setMsg(j.error); }); }, [tab, api]);
  async function pullAll() {
    if (!sweep?.toPull.length || !window.confirm(`Pull ${sweep.toPull.length} garments from the floor? They go back to the warehouse for bulk.`)) return;
    const r = await api("/api/pos/sweep", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pull: sweep.toPull.map((p) => p.sku) }) });
    const j = await r.json(); setMsg(r.ok ? `${j.pulled} pulled.` : j.error); setTab("stock"); void load();
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Stock on the floor</h1><p className="text-sm text-muted-foreground">Oldest first. The stage is the markdown a garment is at this month.</p></div>
        <div className="flex gap-1 rounded-md border p-0.5 text-sm">
          <button type="button" onClick={() => setTab("stock")} className={cn("rounded px-3 py-1", tab === "stock" ? "bg-foreground text-background" : "hover:bg-muted")}>Stock</button>
          <button type="button" onClick={() => setTab("sweep")} className={cn("rounded px-3 py-1", tab === "sweep" ? "bg-foreground text-background" : "hover:bg-muted")}>Monthly sweep</button>
        </div>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      {tab === "stock" && data && (
        <>
          <div className="grid gap-2 sm:grid-cols-5">
            <Stat label="On the floor" value={String(data.summary.count)} sub={pkr(data.summary.value)} />
            {(["full", "md1", "md2", "md3", "pull"] as const).filter((s) => data.summary.by_stage[s]).map((s) => <Stat key={s} label={STAGE_LABELS[s]} value={String(data.summary.by_stage[s].count)} sub={pkr(data.summary.by_stage[s].value)} />)}
          </div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU or brand" className="h-11" />
          <Card><CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">SKU</th><th className="p-2">Garment</th><th className="p-2">Brand</th><th className="p-2">Size</th><th className="p-2">Grade</th><th className="p-2">Stage</th><th className="p-2 text-right">Today</th><th className="p-2 text-right">Days</th><th className="p-2">Colour</th></tr></thead>
              <tbody className="divide-y">
                {data.rows.map((r) => (
                  <tr key={r.id} className={cn(r.stage === "pull" && "bg-red-50 dark:bg-red-950/30")}>
                    <td className="p-2 font-mono text-xs">{r.sku}{r.rare ? " ★" : ""}{r.online ? " 🌐" : ""}</td><td className="p-2">{r.sub_category}</td><td className="p-2">{r.brand ?? "—"}</td><td className="p-2">{r.size ?? "—"}</td><td className="p-2">{GRADE[r.grade] ?? r.grade}</td>
                    <td className="p-2">{STAGE_LABELS[r.stage]}</td><td className="p-2 text-right tabular-nums">{pkr(r.price)}{r.price !== r.list_price ? <span className="block text-[10px] text-muted-foreground line-through">{pkr(r.list_price)}</span> : null}</td><td className="p-2 text-right tabular-nums">{r.days ?? "—"}</td><td className="p-2 capitalize">{r.colour ?? "—"}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nothing on the floor{q ? " matching that" : ""}.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </>
      )}
      {tab === "sweep" && sweep && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Stickers this month <span className="font-normal text-muted-foreground">· {sweep.stickers.length} · current colour {sweep.current}</span></CardTitle></CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-muted-foreground">Walk the floor with this list: each garment gets the sticker shown, and rings up at the price shown.</p>
              <table className="w-full text-sm"><tbody className="divide-y">{sweep.stickers.map((s) => <tr key={s.sku}><td className="py-1 font-mono text-xs">{s.sku}</td><td className="py-1">{s.brand} {s.sub_category}{s.size_label ? ` · ${s.size_label}` : ""}</td><td className="py-1 font-semibold">{s.sticker}</td><td className="py-1 text-right tabular-nums">{pkr(s.price_today)}</td></tr>)}</tbody></table>
              {sweep.stickers.length === 0 && <p className="py-4 text-center text-muted-foreground">No stickers due.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-base"><span>Pull from the floor <span className="font-normal text-muted-foreground">· {sweep.toPull.length}</span></span>{me?.can_manage && sweep.toPull.length > 0 && <Button size="sm" variant="destructive" onClick={pullAll}>Mark all pulled</Button>}</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-muted-foreground">Four colours back: box these for the warehouse. Marking them pulled takes them off the floor count.</p>
              <table className="w-full text-sm"><tbody className="divide-y">{sweep.toPull.map((p) => <tr key={p.sku}><td className="py-1 font-mono text-xs">{p.sku}</td><td className="py-1">{p.brand} {p.sub_category}{p.size_label ? ` · ${p.size_label}` : ""}</td><td className="py-1 text-right tabular-nums text-muted-foreground">{pkr(p.list_price)}</td></tr>)}</tbody></table>
              {sweep.toPull.length === 0 && <p className="py-4 text-center text-muted-foreground">Nothing to pull.</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-md border bg-background p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold tabular-nums">{value}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>;
}
