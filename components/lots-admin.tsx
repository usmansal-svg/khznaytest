"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Pnl = { pieces: number; rejects: number; reject_pct: number; kg_tagged_so_far: number; pct_done: number | null; lot_cost: number | null; cost_tagged: number; expected_revenue: number; expected_gp: number; gp_pct: number; gp_per_piece: number; sold: number; sold_revenue: number };
type Lot = { id: number; code: string; supplier: string; basis: "kg" | "pc"; rate: number | null; kg_bought: number | null; kg_tagged: number | null; provisional_yield: number; yield: number; effective_rate: number | null; status: "open" | "closed"; parent_lot_id: number | null; arrived_on: string | null; notes: string | null; pnl: Pnl };

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function LotsAdmin() {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [defaultYield, setDefaultYield] = useState(0.9);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Create form
  const [code, setCode] = useState("");
  const [supplier, setSupplier] = useState("");
  const [basis, setBasis] = useState<"kg" | "pc">("kg");
  const [rate, setRate] = useState("");
  const [kg, setKg] = useState("");
  const [yieldEst, setYieldEst] = useState("");
  const [arrived, setArrived] = useState("");
  const [parent, setParent] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    const j = await (await fetch("/api/lots")).json();
    setLots(j.lots ?? []);
    if (j.settings?.default_provisional_yield) setDefaultYield(j.settings.default_provisional_yield);
  }
  useEffect(() => {
    void load();
  }, []);

  async function call(method: "POST" | "PATCH", body: unknown, ok: string) {
    setBusy(true);
    setMessage(null);
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
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const ok = await call(
      "POST",
      { code, supplier, basis, rate: Number(rate), kg: basis === "kg" ? Number(kg) : null, provisional_yield: yieldEst ? Number(yieldEst) : null, arrived_on: arrived || null, notes, parent_lot_id: parent ? Number(parent) : null },
      `Lot ${code.toUpperCase()} created.`,
    );
    if (ok) {
      setCode(""); setSupplier(""); setRate(""); setKg(""); setYieldEst(""); setArrived(""); setParent(""); setNotes("");
    }
  }

  async function close(lot: Lot) {
    const suggested = lot.pnl.kg_tagged_so_far ? String(lot.pnl.kg_tagged_so_far) : "";
    const input = lot.basis === "kg" ? window.prompt(`Close ${lot.code}. Total kg that reached a tag (true-up):`, suggested) : "0";
    if (input === null) return;
    const kgTagged = Number(input);
    if (lot.basis === "kg" && !(kgTagged >= 0)) return setMessage({ tone: "error", text: "Enter the kg tagged." });
    await call("PATCH", { id: lot.id, action: "close", kg_tagged: lot.basis === "kg" ? kgTagged : null }, `${lot.code} closed. Garments already tagged keep their price; the true-up lands in margin.`);
  }

  if (!lots) return <p className="text-muted-foreground">Loading…</p>;

  const open = lots.filter((l) => l.status === "open");
  const closed = lots.filter((l) => l.status === "closed");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lots</h1>
        <p className="text-sm text-muted-foreground">Every purchase is a lot. A garment&apos;s cost is its own weight × the lot&apos;s effective rate. Compare lots on GP per piece, not GP %.</p>
      </div>
      {message && <p className={cn("rounded-md border p-3 text-sm", message.tone === "ok" ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "border-red-600 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300")}>{message.text}</p>}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="self-start">
          <CardHeader className="pb-3"><CardTitle className="text-base">New lot</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1.5"><Label htmlFor="code">Lot code</Label><Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LOT-B-02" /></div>
            <div className="grid gap-1.5"><Label htmlFor="vendor">Vendor</Label><Input id="vendor" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
            <div className="grid gap-1.5">
              <Label>Basis</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={basis === "kg" ? "default" : "outline"} onClick={() => setBasis("kg")}>By weight (kg)</Button>
                <Button type="button" size="sm" variant={basis === "pc" ? "default" : "outline"} onClick={() => setBasis("pc")}>Per piece</Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rate">{basis === "kg" ? "Rate · USD per kg" : "Rate · PKR per piece"}</Label>
              <Input id="rate" type="number" step={basis === "kg" ? "0.01" : "1"} min="0" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={basis === "kg" ? "6.00" : "600"} />
            </div>
            {basis === "kg" && (
              <>
                <div className="grid gap-1.5"><Label htmlFor="kg">kg bought</Label><Input id="kg" type="number" step="0.1" min="0" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="27" /></div>
                <div className="grid gap-1.5">
                  <Label htmlFor="yield">Provisional yield <span className="font-normal text-muted-foreground">· default {defaultYield}</span></Label>
                  <Input id="yield" type="number" step="0.01" min="0.1" max="1" value={yieldEst} onChange={(e) => setYieldEst(e.target.value)} placeholder={String(defaultYield)} />
                  <p className="text-xs text-muted-foreground">Share of bought kg expected to reach a tag. Corrected at close.</p>
                </div>
              </>
            )}
            <div className="grid gap-1.5"><Label htmlFor="arrived">Arrived</Label><Input id="arrived" type="date" value={arrived} onChange={(e) => setArrived(e.target.value)} /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="parent">Split from <span className="font-normal text-muted-foreground">· optional</span></Label>
              <select id="parent" value={parent} onChange={(e) => setParent(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">— not a split —</option>
                {lots.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">A bundle tagged across two seasons becomes two lots under one parent. Weigh each pile when you separate them.</p>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="notes">Notes</Label><Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <Button onClick={create} disabled={busy || !code || !rate || (basis === "kg" && !kg)} className="w-full">Create lot</Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <LotTable title={`Open · ${open.length}`} lots={open} onClose={close} busy={busy} />
          {closed.length > 0 && <LotTable title={`Closed · ${closed.length}`} lots={closed} busy={busy} onReopen={(l) => call("PATCH", { id: l.id, action: "reopen" }, `${l.code} reopened.`)} />}
        </div>
      </div>
    </div>
  );
}

function LotTable({ title, lots, onClose, onReopen, busy }: { title: string; lots: Lot[]; onClose?: (l: Lot) => void; onReopen?: (l: Lot) => void; busy: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {lots.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">No lots yet. Create one to start tagging.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-2">Lot</th><th className="pb-2 pr-2">Rate</th><th className="pb-2 pr-2">Yield</th><th className="pb-2 pr-2">Effective</th>
                  <th className="pb-2 pr-2 text-right">Done</th><th className="pb-2 pr-2 text-right">Pieces</th><th className="pb-2 pr-2 text-right">Rejects</th>
                  <th className="pb-2 pr-2 text-right">Cost tagged</th><th className="pb-2 pr-2 text-right">Exp. revenue</th><th className="pb-2 pr-2 text-right">Exp. GP</th><th className="pb-2 pr-2 text-right">GP/piece</th><th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-2"><div className="font-mono text-xs font-semibold">{l.code}</div><div className="text-xs text-muted-foreground">{l.supplier}{l.parent_lot_id ? " · split" : ""}</div></td>
                    <td className="py-2 pr-2 tabular-nums">{l.basis === "kg" ? `$${l.rate}/kg` : `Rs ${l.rate}/pc`}{l.basis === "kg" && l.kg_bought ? <div className="text-xs text-muted-foreground">{l.kg_bought} kg</div> : null}</td>
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
                      {onClose && <Button size="sm" variant="outline" disabled={busy} onClick={() => onClose(l)}>Close</Button>}
                      {onReopen && <Button size="sm" variant="outline" disabled={busy} onClick={() => onReopen(l)}>Reopen</Button>}
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
