"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { METHOD_LABELS, pkr, usePos, when } from "@/components/pos/pos-context";
import { cn } from "@/lib/utils";

type Session = { id: number; opened_at: string; opening_float: number; opened_by: string | null; receipts: number; voided: number; by_method: Record<string, number>; total: number; cash_refunds: number; expected_cash: number };

/** Open the till with a float; close it by counting the drawer. Expected cash is float + cash sales − cash refunds. */
export function SessionPage() {
  const { api, reload } = usePos();
  const [s, setS] = useState<Session | null | undefined>(undefined);
  const [float, setFloat] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [closed, setClosed] = useState<{ expected_cash: number; counted_cash: number; difference: number; receipts: number; total: number; by_method: Record<string, number> } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await api("/api/pos/session"); const j = await r.json(); if (r.ok) setS(j.session); else setMsg(j.error); }, [api]);
  useEffect(() => { void load(); }, [load]);

  async function open() {
    setBusy(true); setMsg(null);
    const r = await api("/api/pos/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opening_float: Math.round(Number(float) || 0) }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.error); return; }
    setClosed(null); await load(); void reload();
  }
  async function close() {
    if (!window.confirm("Close the till? Sales stop until it is opened again.")) return;
    setBusy(true); setMsg(null);
    const r = await api("/api/pos/session", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ counted_cash: Math.round(Number(counted) || 0), note }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.error); return; }
    setClosed(j.closed); setCounted(""); setNote(""); await load(); void reload();
  }

  if (s === undefined) return <p className="text-muted-foreground">Loading…</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div><h1 className="text-2xl font-bold">Till session</h1><p className="text-sm text-muted-foreground">Open with the float in the drawer at the start; close by counting the drawer at the end. The difference is what the manager sees.</p></div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      {closed && (
        <Card className={cn(closed.difference === 0 ? "border-green-600" : "border-amber-500")}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Till closed</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <div className="flex justify-between"><span>Receipts</span><span>{closed.receipts} · {pkr(closed.total)}</span></div>
            {Object.entries(closed.by_method).map(([m, v]) => <div key={m} className="flex justify-between text-muted-foreground"><span>{METHOD_LABELS[m] ?? m}</span><span>{pkr(v)}</span></div>)}
            <div className="flex justify-between border-t pt-1"><span>Expected cash</span><span className="tabular-nums">{pkr(closed.expected_cash)}</span></div>
            <div className="flex justify-between"><span>Counted</span><span className="tabular-nums">{pkr(closed.counted_cash)}</span></div>
            <div className={cn("flex justify-between text-lg font-bold", closed.difference < 0 ? "text-red-700 dark:text-red-400" : closed.difference > 0 ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400")}><span>{closed.difference === 0 ? "Balanced" : closed.difference < 0 ? "Short" : "Over"}</span><span className="tabular-nums">{pkr(Math.abs(closed.difference))}</span></div>
          </CardContent>
        </Card>
      )}
      {!s ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Open the till</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1"><Label htmlFor="float">Opening float · Rs</Label><Input id="float" type="number" inputMode="numeric" value={float} onChange={(e) => setFloat(e.target.value)} className="h-12 text-lg" placeholder="e.g. 5000" /></div>
            <Button className="h-12 w-full" disabled={busy} onClick={open}>{busy ? "Opening…" : "Open till"}</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Open since {when(s.opened_at)} <span className="font-normal text-muted-foreground">· by {s.opened_by ?? "—"} · float {pkr(s.opening_float)}</span></CardTitle></CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <div className="flex justify-between"><span>Receipts</span><span>{s.receipts}{s.voided ? ` (${s.voided} voided)` : ""} · {pkr(s.total)}</span></div>
              {Object.entries(s.by_method).map(([m, v]) => <div key={m} className="flex justify-between text-muted-foreground"><span>{METHOD_LABELS[m] ?? m}</span><span className="tabular-nums">{pkr(v)}</span></div>)}
              {s.cash_refunds > 0 && <div className="flex justify-between text-muted-foreground"><span>Cash refunds</span><span className="tabular-nums">−{pkr(s.cash_refunds)}</span></div>}
              <div className="flex justify-between border-t pt-1 font-semibold"><span>Cash that should be in the drawer</span><span className="tabular-nums">{pkr(s.expected_cash)}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Close the till</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1"><Label htmlFor="counted">Cash counted in the drawer · Rs</Label><Input id="counted" type="number" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} className="h-12 text-lg" /></div>
              {counted !== "" && <p className={cn("text-sm font-semibold", Number(counted) - s.expected_cash === 0 ? "text-green-700 dark:text-green-400" : Number(counted) < s.expected_cash ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>{Number(counted) - s.expected_cash === 0 ? "Balanced" : Number(counted) < s.expected_cash ? `Short by ${pkr(s.expected_cash - Number(counted))}` : `Over by ${pkr(Number(counted) - s.expected_cash)}`}</p>}
              <div className="grid gap-1"><Label htmlFor="note">Note <span className="font-normal text-muted-foreground">· optional</span></Label><Input id="note" value={note} onChange={(e) => setNote(e.target.value)} className="h-10" placeholder="e.g. Rs 500 taken for tea money" /></div>
              <Button variant="destructive" className="h-12 w-full" disabled={busy || counted === ""} onClick={close}>{busy ? "Closing…" : "Close till"}</Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
