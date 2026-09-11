"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, RotateCcw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReceiptPaper, type ReceiptData } from "@/components/pos/receipt";
import { METHOD_LABELS, pkr, usePos, when } from "@/components/pos/pos-context";
import { cn } from "@/lib/utils";

type Line = { id: number; sku: string; brand: string; sub_category: string; sold_price: number; returned_at: string | null; refund_amount: number | null };
type Sale = { id: number; receipt_no: string; sold_at: string; subtotal: number; discount: number; total: number; payment_method: string; customer_phone: string | null; voided_at: string | null; void_reason: string | null; cashier: string | null; lines: Line[] };
type FullLine = Line & { sold_stage: string; list_price: number; shelf_price: number | null; override_reason: string | null; return_reason: string | null; return_disposition: string | null; size_label: string | null };
type Full = Omit<ReceiptData, "lines"> & { id: number; lines: FullLine[]; void_reason: string | null };

/** Receipts for this outlet: find, reprint, return a garment, void a receipt. */
export function SalesPage() {
  const { api, me } = usePos();
  // Dates are set after mount: the prerender must not see the clock.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => { const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10); setFrom(today); setTo(today); }, []);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ sales: Sale[]; summary: { receipts: number; garments: number; total: number; refunds: number; by_method: Record<string, number> } } | null>(null);
  const [open, setOpen] = useState<Full | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ret, setRet] = useState<{ line: FullLine; reason: string; refund: string; disposition: "back_on_floor" | "damaged" } | null>(null);
  const [voidReason, setVoidReason] = useState<string | null>(null);

  const load = useCallback(async () => { if (!from || !to) return; const r = await api(`/api/pos/sales?from=${from}&to=${to}${q ? `&q=${encodeURIComponent(q)}` : ""}`); const j = await r.json(); if (r.ok) setData(j); else setMsg(j.error); }, [api, from, to, q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  async function show(id: number) { const r = await api(`/api/pos/sale/${id}`); const j = await r.json(); if (r.ok) setOpen(j.sale); else setMsg(j.error); }
  async function doReturn() {
    if (!ret || !open) return;
    setBusy(true); setMsg(null);
    const r = await api("/api/pos/return", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sale_item_id: ret.line.id, reason: ret.reason, refund_amount: Math.round(Number(ret.refund) || 0), disposition: ret.disposition }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.error); return; }
    setRet(null); await show(open.id); void load();
  }
  async function doVoid() {
    if (!open || voidReason == null) return;
    setBusy(true); setMsg(null);
    const r = await api("/api/pos/void", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sale_id: open.id, reason: voidReason }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.error); return; }
    setVoidReason(null); await show(open.id); void load();
  }

  if (open) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" onClick={() => { setOpen(null); setRet(null); setVoidReason(null); }}><X className="size-4" /> Back</Button>
          <Button onClick={() => window.print()}><Printer className="size-4" /> Reprint</Button>
          {me?.can_manage && !open.voided_at && voidReason == null && <Button variant="destructive" className="ml-auto" onClick={() => setVoidReason("")}>Void receipt</Button>}
        </div>
        {msg && <p className="text-sm text-destructive">{msg}</p>}
        {voidReason != null && (
          <Card className="border-red-400 print:hidden"><CardContent className="space-y-2 pt-4">
            <p className="text-sm font-semibold">Void {open.receipt_no}? Every garment goes back on the floor and the receipt is marked void. This cannot be undone.</p>
            <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason · required" className="h-10" />
            <div className="flex gap-2"><Button variant="outline" onClick={() => setVoidReason(null)}>Cancel</Button><Button variant="destructive" disabled={busy || voidReason.trim().length < 3} onClick={doVoid}>{busy ? "Voiding…" : "Yes, void it"}</Button></div>
          </CardContent></Card>
        )}
        <Card className="print:hidden">
          <CardHeader className="pb-2"><CardTitle className="text-base">Garments on this receipt</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {open.lines.map((l) => (
                <li key={l.id} className="py-2">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={cn("font-medium", l.returned_at && "line-through text-muted-foreground")}>{l.brand} · {l.sub_category}{l.size_label ? ` · ${l.size_label}` : ""} <span className="font-mono text-xs text-muted-foreground">{l.sku}</span></div>
                      <div className="text-xs text-muted-foreground">Sold {pkr(l.sold_price)}{l.shelf_price != null && l.shelf_price !== l.sold_price ? ` (shelf ${pkr(l.shelf_price)} — ${l.override_reason})` : ""}{l.returned_at ? ` · returned ${when(l.returned_at)}: ${l.return_reason} · refund ${pkr(l.refund_amount ?? 0)} · ${l.return_disposition === "damaged" ? "marked damaged" : "back on the floor"}` : ""}</div>
                    </div>
                    {!l.returned_at && !open.voided_at && <Button size="sm" variant="outline" onClick={() => setRet({ line: l, reason: "", refund: String(l.sold_price), disposition: "back_on_floor" })}><RotateCcw className="size-3.5" /> Return</Button>}
                  </div>
                  {ret?.line.id === l.id && (
                    <div className="mt-2 grid gap-2 rounded-md border border-amber-400 p-3">
                      <Input value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} placeholder="Why is it coming back? · required" className="h-10" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm">Refund Rs</span><Input type="number" inputMode="numeric" value={ret.refund} onChange={(e) => setRet({ ...ret, refund: e.target.value })} className="h-10 w-28" />
                        <select value={ret.disposition} onChange={(e) => setRet({ ...ret, disposition: e.target.value as "back_on_floor" | "damaged" })} className="h-10 rounded-md border border-input bg-transparent px-2 text-sm"><option value="back_on_floor">Back on the floor</option><option value="damaged">Damaged — off the floor</option></select>
                        <Button variant="outline" onClick={() => setRet(null)}>Cancel</Button>
                        <Button disabled={busy || ret.reason.trim().length < 3} onClick={doReturn}>{busy ? "Saving…" : "Record return"}</Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <ReceiptPaper r={open} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Sales</h1><p className="text-sm text-muted-foreground">Receipts at this outlet. Open one to reprint, return a garment, or void it.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-40" />
        <span className="text-muted-foreground">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-40" />
        <div className="relative min-w-[14rem] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Receipt number or phone" className="h-10 pl-9" /></div>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      {data && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            <Stat label="Receipts" value={String(data.summary.receipts)} /><Stat label="Garments" value={String(data.summary.garments)} /><Stat label="Takings" value={pkr(data.summary.total)} sub={Object.entries(data.summary.by_method).map(([m, v]) => `${METHOD_LABELS[m] ?? m} ${pkr(v)}`).join(" · ")} /><Stat label="Refunds" value={pkr(data.summary.refunds)} />
          </div>
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Receipt</th><th className="p-2">When</th><th className="p-2">Items</th><th className="p-2">Paid by</th><th className="p-2">Cashier</th><th className="p-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y">
                {data.sales.map((s) => (
                  <tr key={s.id} onClick={() => show(s.id)} className={cn("cursor-pointer hover:bg-muted/50", s.voided_at && "text-muted-foreground line-through")}>
                    <td className="p-2 font-mono text-xs">{s.receipt_no}</td><td className="p-2">{when(s.sold_at)}</td><td className="p-2">{s.lines.length}{s.lines.some((l) => l.returned_at) ? ` (${s.lines.filter((l) => l.returned_at).length} returned)` : ""}</td><td className="p-2">{METHOD_LABELS[s.payment_method] ?? s.payment_method}</td><td className="p-2">{s.cashier ?? "—"}</td><td className="p-2 text-right tabular-nums">{pkr(s.total)}</td>
                  </tr>
                ))}
                {data.sales.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No receipts in this range.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-md border bg-background p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold tabular-nums">{value}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>;
}
