"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Pnl = { pieces: number; rejects: number; reject_pct: number; kg_tagged_so_far: number; pct_done: number | null; lot_cost: number | null; cost_tagged: number; expected_revenue: number; expected_gp: number; gp_pct: number; gp_per_piece: number; sold: number; sold_revenue: number };
type Lot = {
  id: number; code: string; supplier: string; basis: "kg" | "pc"; rate: number | null; kg_bought: number | null; kg_tagged: number | null; pieces_bought: number | null;
  provisional_yield: number; yield: number; effective_rate: number | null; status: "open" | "closed" | "split"; parent_lot_id: number | null;
  arrived_on: string | null; notes: string | null; description: string | null; pnl: Pnl;
};

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function LotsAdmin() {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [defaultYield, setDefaultYield] = useState(0.9);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Lot | null>(null);
  const [splitting, setSplitting] = useState<Lot | null>(null);

  // Create form
  const [f, setF] = useState({ code: "", supplier: "", basis: "kg" as "kg" | "pc", rate: "", kg: "", pieces: "", yieldEst: "", arrived: "", description: "", notes: "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function load() {
    const j = await (await fetch("/api/lots")).json();
    setLots(j.lots ?? []);
    if (j.settings?.default_provisional_yield) setDefaultYield(j.settings.default_provisional_yield);
  }
  useEffect(() => { void load(); }, []);

  async function call(method: "POST" | "PATCH", body: unknown, ok: string) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/lots", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed.");
      setMessage({ tone: "ok", text: ok });
      await load();
      return true;
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Failed." });
      return false;
    } finally { setBusy(false); }
  }

  async function create() {
    const ok = await call("POST", {
      code: f.code, supplier: f.supplier, basis: f.basis, rate: Number(f.rate),
      kg: f.basis === "kg" ? Number(f.kg) : null, pieces: f.basis === "pc" && f.pieces ? Number(f.pieces) : null,
      provisional_yield: f.yieldEst ? Number(f.yieldEst) : null, arrived_on: f.arrived || null, description: f.description, notes: f.notes,
    }, `Lot ${f.code.toUpperCase()} created.`);
    if (ok) setF({ code: "", supplier: "", basis: f.basis, rate: "", kg: "", pieces: "", yieldEst: "", arrived: "", description: "", notes: "" });
  }

  async function close(lot: Lot) {
    let kgTagged: number | null = null;
    if (lot.basis === "kg") {
      const input = window.prompt(`Close ${lot.code}. Total kg that reached a tag (true-up):`, lot.pnl.kg_tagged_so_far ? String(lot.pnl.kg_tagged_so_far) : "");
      if (input === null) return;
      kgTagged = Number(input);
      if (!(kgTagged >= 0)) return setMessage({ tone: "error", text: "Enter the kg tagged." });
    }
    await call("PATCH", { id: lot.id, action: "close", kg_tagged: kgTagged }, `${lot.code} closed. Garments already tagged keep their price; the true-up lands in margin.`);
  }

  if (!lots) return <p className="text-muted-foreground">Loading…</p>;
  const open = lots.filter((l) => l.status === "open");
  const done = lots.filter((l) => l.status !== "open");
  const canCreate = f.code && f.rate && (f.basis === "pc" || f.kg);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lots</h1>
        <p className="text-sm text-muted-foreground">Every purchase is a lot. A garment&apos;s cost is its own weight × the lot&apos;s effective rate, or the lot&apos;s per-piece price. Compare lots on GP per piece, not GP %.</p>
      </div>
      {message && <p className={cn("rounded-md border p-3 text-sm", message.tone === "ok" ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "border-red-600 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300")}>{message.text}</p>}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="self-start">
          <CardHeader className="pb-3"><CardTitle className="text-base">New lot</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1.5"><Label htmlFor="code">Lot code</Label><Input id="code" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="LOT-B-02" /></div>
            <div className="grid gap-1.5"><Label htmlFor="vendor">Vendor</Label><Input id="vendor" value={f.supplier} onChange={(e) => set("supplier", e.target.value)} /></div>
            <div className="grid gap-1.5">
              <Label>Basis</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={f.basis === "kg" ? "default" : "outline"} onClick={() => set("basis", "kg")}>By weight (kg)</Button>
                <Button type="button" size="sm" variant={f.basis === "pc" ? "default" : "outline"} onClick={() => set("basis", "pc")}>Per piece</Button>
              </div>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="rate">{f.basis === "kg" ? "Rate · USD per kg" : "Rate · PKR per piece"}</Label><Input id="rate" type="number" step={f.basis === "kg" ? "0.01" : "1"} min="0" value={f.rate} onChange={(e) => set("rate", e.target.value)} placeholder={f.basis === "kg" ? "6.00" : "600"} /></div>
            {f.basis === "kg" ? (
              <>
                <div className="grid gap-1.5"><Label htmlFor="kg">kg bought</Label><Input id="kg" type="number" step="0.1" min="0" value={f.kg} onChange={(e) => set("kg", e.target.value)} placeholder="1000" /></div>
                <div className="grid gap-1.5"><Label htmlFor="yield">Provisional yield <span className="font-normal text-muted-foreground">· default {defaultYield}</span></Label><Input id="yield" type="number" step="0.01" min="0.1" max="1" value={f.yieldEst} onChange={(e) => set("yieldEst", e.target.value)} placeholder={String(defaultYield)} /><p className="text-xs text-muted-foreground">Share of bought kg expected to reach a tag. Corrected at close.</p></div>
              </>
            ) : (
              <div className="grid gap-1.5"><Label htmlFor="pcs">Pieces bought</Label><Input id="pcs" type="number" step="1" min="1" value={f.pieces} onChange={(e) => set("pieces", e.target.value)} placeholder="500" /><p className="text-xs text-muted-foreground">Lets the lot show progress, cost, and split into piles.</p></div>
            )}
            <div className="grid gap-1.5"><Label htmlFor="arrived">Arrived</Label><Input id="arrived" type="date" value={f.arrived} onChange={(e) => set("arrived", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="desc">Description <span className="font-normal text-muted-foreground">· what&apos;s in it</span></Label><Textarea id="desc" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Mixed men's winter — jackets, hoodies, some shirts. UK grade A." /></div>
            <div className="grid gap-1.5"><Label htmlFor="notes">Notes <span className="font-normal text-muted-foreground">· internal</span></Label><Input id="notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. paid 50% deposit" /></div>
            <Button onClick={create} disabled={busy || !canCreate} className="w-full">Create lot</Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {editing && <EditCard lot={editing} busy={busy} onCancel={() => setEditing(null)} onSave={async (patch) => { const ok = await call("PATCH", { id: editing.id, ...patch }, `${editing.code} updated.`); if (ok) setEditing(null); }} />}
          {splitting && <SplitCard lot={splitting} busy={busy} onCancel={() => setSplitting(null)} onSplit={async (piles) => { const ok = await call("PATCH", { id: splitting.id, action: "split", piles }, `${splitting.code} split into ${piles.length} piles. Tag from the piles.`); if (ok) setSplitting(null); }} />}
          <LotTable title={`Open · ${open.length}`} lots={open} busy={busy} onEdit={setEditing} onSplit={setSplitting} onClose={close} />
          {done.length > 0 && <LotTable title={`Closed & split · ${done.length}`} lots={done} busy={busy} onEdit={setEditing} onReopen={(l) => call("PATCH", { id: l.id, action: "reopen" }, `${l.code} reopened.`)} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ edit */

function EditCard({ lot, busy, onCancel, onSave }: { lot: Lot; busy: boolean; onCancel: () => void; onSave: (patch: Record<string, unknown>) => void }) {
  const [e, setE] = useState({ supplier: lot.supplier, rate: String(lot.rate ?? ""), kg: String(lot.kg_bought ?? ""), pieces: String(lot.pieces_bought ?? ""), yieldEst: String(lot.provisional_yield), arrived: lot.arrived_on ?? "", description: lot.description ?? "", notes: lot.notes ?? "" });
  const s = (k: keyof typeof e, v: string) => setE((x) => ({ ...x, [k]: v }));
  const tagged = lot.pnl.pieces > 0;
  return (
    <Card className="border-amber-500">
      <CardHeader className="pb-3"><CardTitle className="text-base">Edit {lot.code}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {tagged && <p className="rounded-md border border-amber-600 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">{lot.pnl.pieces} garment{lot.pnl.pieces === 1 ? "" : "s"} already tagged from this lot keep their price. A new rate or weight changes the effective rate for garments tagged from now on, and the lot&apos;s cost in P&L.</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5"><Label>Vendor</Label><Input value={e.supplier} onChange={(x) => s("supplier", x.target.value)} /></div>
          <div className="grid gap-1.5"><Label>{lot.basis === "kg" ? "Rate · USD/kg" : "Rate · PKR/piece"}</Label><Input type="number" step={lot.basis === "kg" ? "0.01" : "1"} value={e.rate} onChange={(x) => s("rate", x.target.value)} /></div>
          {lot.basis === "kg" ? <div className="grid gap-1.5"><Label>kg bought</Label><Input type="number" step="0.1" value={e.kg} onChange={(x) => s("kg", x.target.value)} /></div> : <div className="grid gap-1.5"><Label>Pieces bought</Label><Input type="number" step="1" value={e.pieces} onChange={(x) => s("pieces", x.target.value)} /></div>}
          {lot.basis === "kg" && <div className="grid gap-1.5"><Label>Provisional yield</Label><Input type="number" step="0.01" min="0.1" max="1" value={e.yieldEst} onChange={(x) => s("yieldEst", x.target.value)} /></div>}
          <div className="grid gap-1.5"><Label>Arrived</Label><Input type="date" value={e.arrived} onChange={(x) => s("arrived", x.target.value)} /></div>
        </div>
        <div className="grid gap-1.5"><Label>Description · what&apos;s in it</Label><Textarea rows={2} value={e.description} onChange={(x) => s("description", x.target.value)} /></div>
        <div className="grid gap-1.5"><Label>Notes · internal</Label><Input value={e.notes} onChange={(x) => s("notes", x.target.value)} /></div>
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => onSave({ supplier: e.supplier, rate: Number(e.rate), ...(lot.basis === "kg" ? { kg: Number(e.kg) || null, provisional_yield: Number(e.yieldEst) } : { pieces: e.pieces ? Number(e.pieces) : null }), arrived_on: e.arrived || null, description: e.description, notes: e.notes })}>Save changes</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------- split */

function SplitCard({ lot, busy, onCancel, onSplit }: { lot: Lot; busy: boolean; onCancel: () => void; onSplit: (piles: { kg?: number; pieces?: number; description?: string }[]) => void }) {
  const [piles, setPiles] = useState<{ qty: string; description: string }[]>([{ qty: "", description: "" }, { qty: "", description: "" }]);
  const byKg = lot.basis === "kg";
  const unit = byKg ? "kg" : "pieces";
  const bought = byKg ? lot.kg_bought : lot.pieces_bought;
  const total = piles.reduce((a, p) => a + (Number(p.qty) || 0), 0);
  return (
    <Card className="border-amber-500">
      <CardHeader className="pb-3"><CardTitle className="text-base">Split {lot.code}{bought ? ` · ${bought} ${unit}` : ""} into piles</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{byKg ? "Weigh each pile as you separate it." : "Count each pile as you separate it."} The piles become {lot.code}-A, -B, … with the same rate{byKg ? " and yield" : ""}; {lot.code} keeps the cost and can no longer be tagged from.{bought ? ` Piles so far: ${total} of ${bought} ${unit}.` : ""}</p>
        <div className="space-y-2">
          {piles.map((p, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[110px_1fr]">
              <div className="grid gap-1"><Label className="text-xs">{lot.code}-{String.fromCharCode(65 + i)} · {unit}</Label><Input type="number" step={byKg ? "0.1" : "1"} min="0" value={p.qty} onChange={(x) => setPiles((ps) => ps.map((v, j) => (j === i ? { ...v, qty: x.target.value } : v)))} className="h-10" /></div>
              <div className="grid gap-1"><Label className="text-xs">What this pile is</Label><Input value={p.description} onChange={(x) => setPiles((ps) => ps.map((v, j) => (j === i ? { ...v, description: x.target.value } : v)))} placeholder={i === 0 ? "e.g. Men's sport shirts" : i === 1 ? "e.g. Men's button-down shirts" : "e.g. Men's polo shirts"} className="h-10" /></div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setPiles((ps) => [...ps, { qty: "", description: "" }])}>+ pile</Button>
        </div>
        <div className="flex gap-2">
          <Button disabled={busy || total <= 0} onClick={() => onSplit(piles.filter((p) => Number(p.qty) > 0).map((p) => ({ ...(byKg ? { kg: Number(p.qty) } : { pieces: Number(p.qty) }), description: p.description })))}>Create piles</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------- table */

function LotTable({ title, lots, busy, onEdit, onSplit, onClose, onReopen }: { title: string; lots: Lot[]; busy: boolean; onEdit: (l: Lot) => void; onSplit?: (l: Lot) => void; onClose?: (l: Lot) => void; onReopen?: (l: Lot) => void }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {lots.length === 0 ? <p className="py-6 text-center text-muted-foreground">No lots yet. Create one to start tagging.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-2">Lot</th><th className="pb-2 pr-2">Rate</th><th className="pb-2 pr-2 text-right">Bought</th><th className="pb-2 pr-2">Yield</th><th className="pb-2 pr-2">Effective</th>
                  <th className="pb-2 pr-2 text-right">Done</th><th className="pb-2 pr-2 text-right">Tagged</th><th className="pb-2 pr-2 text-right">Rejects</th>
                  <th className="pb-2 pr-2 text-right">Cost tagged</th><th className="pb-2 pr-2 text-right">Exp. revenue</th><th className="pb-2 pr-2 text-right">Exp. GP</th><th className="pb-2 pr-2 text-right">GP/piece</th><th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y align-top">
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-2">
                      <div className="font-mono text-xs font-semibold">{l.code}</div>
                      <div className="text-xs text-muted-foreground">{l.supplier}{l.parent_lot_id ? " · pile" : ""}{l.arrived_on ? ` · ${l.arrived_on}` : ""}</div>
                      {l.description && <div className="mt-0.5 max-w-[16rem] truncate text-xs" title={l.description}>{l.description}</div>}
                    </td>
                    <td className="py-2 pr-2 tabular-nums">{l.rate == null ? "—" : l.basis === "kg" ? `$${l.rate}/kg` : `Rs ${l.rate}/pc`}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{l.basis === "kg" ? (l.kg_bought != null ? `${l.kg_bought} kg` : "—") : (l.pieces_bought != null ? `${l.pieces_bought} pc` : "—")}</td>
                    <td className="py-2 pr-2 tabular-nums">{l.basis === "kg" ? <>{pct(l.yield)}<div className="text-xs text-muted-foreground">{l.kg_tagged != null ? "actual" : "provisional"}</div></> : "—"}</td>
                    <td className="py-2 pr-2 tabular-nums">{l.effective_rate == null ? "—" : l.basis === "kg" ? `$${l.effective_rate.toFixed(2)}/kg` : `Rs ${l.effective_rate}`}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{l.pnl.pct_done == null ? "—" : pct(l.pnl.pct_done)}{l.basis === "kg" ? <div className="text-xs text-muted-foreground">{l.pnl.kg_tagged_so_far} kg</div> : null}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{l.pnl.pieces}</td>
                    <td className={cn("py-2 pr-2 text-right tabular-nums", l.pnl.reject_pct > 0.03 && "text-red-700 dark:text-red-400")}>{l.pnl.rejects}{l.pnl.pieces ? <div className="text-xs text-muted-foreground">{pct(l.pnl.reject_pct)}</div> : null}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{rs(l.pnl.cost_tagged)}{l.pnl.lot_cost != null ? <div className="text-xs text-muted-foreground">of {rs(l.pnl.lot_cost)}</div> : null}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{rs(l.pnl.expected_revenue)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{rs(l.pnl.expected_gp)}<div className="text-xs text-muted-foreground">{pct(l.pnl.gp_pct)}</div></td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums">{rs(l.pnl.gp_per_piece)}</td>
                    <td className="py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(l)}>Edit</Button>
                        {onSplit && <Button size="sm" variant="outline" disabled={busy} onClick={() => onSplit(l)}>Split</Button>}
                        {onClose && <Button size="sm" variant="outline" disabled={busy} onClick={() => onClose(l)}>Close</Button>}
                        {onReopen && l.status === "closed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => onReopen(l)}>Reopen</Button>}
                        {l.status === "split" && <span className="self-center text-xs text-muted-foreground">split into piles</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
