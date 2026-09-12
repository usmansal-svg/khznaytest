"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ClipboardCheck, Globe, PackageOpen, Printer, ScanLine, Truck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TRANSFER_LABEL, TRANSFER_STEPS, type TransferStatus } from "@/lib/transfers/reconcile";
import { cn } from "@/lib/utils";

type Line = { id: number; sku: string; brand: string; sub_category: string; grade: string; size_label: string | null; list_price: number | null; status: string; floored_on: string | null; qc?: boolean; added_at: string; received_at: string | null; missing: boolean; unexpected: boolean; found_at: string | null };
type Transfer = {
  id: number; code: string; to_outlet_id: number; to_outlet: string; status: TransferStatus; created_at: string; created_by: string;
  sent_at: string | null; dispatched_by: string; boxes: number | null; carrier: string | null; receiving_started_at: string | null;
  received_at: string | null; received_by: string; received_count: number | null; missing_count: number | null; unexpected_count: number | null; note: string | null; items: Line[];
};
type Outlet = { id: number; name: string; is_online: boolean };

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/**
 * Packing → In transit → Receiving → Received.
 *
 * Packing: scan every tag into the box, print the packing list, dispatch.
 * Receiving: the outlet scans every garment out of the box; the close
 * reconciles the list against the scans and flags what is missing or was
 * not on the list. A received garment sits in the outlet's stockroom until
 * the Floor screen scans it onto the floor — that is when its colour and
 * markdown clock start.
 */
export function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [current, setCurrent] = useState<Transfer | null>(null);
  const [outletId, setOutletId] = useState("");
  const [note, setNote] = useState("");
  const [scan, setScan] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [boxes, setBoxes] = useState("");
  const [carrier, setCarrier] = useState("");
  const [canPush, setCanPush] = useState(false);
  const [pushing, setPushing] = useState<{ total: number; done: number; failed: string[] } | null>(null);
  const [lastScan, setLastScan] = useState<{ sku: string; kind: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  async function load() {
    const j = await (await fetch("/api/transfers")).json();
    setTransfers(j.transfers ?? []);
    if (current) setCurrent((j.transfers as Transfer[]).find((t) => t.id === current.id) ?? null);
  }
  useEffect(() => {
    void load();
    fetch("/api/reference").then((r) => r.json()).then((j) => setOutlets((j.outlets ?? []).filter((o: Outlet) => !o.is_online)));
    fetch("/api/auth/me").then((r) => r.json()).then((j) => setCanPush(["manager", "founder"].includes(j.staff?.role))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (current?.status === "packing" || current?.status === "receiving") scanRef.current?.focus();
  }, [current?.id, current?.status]);

  async function call(method: "POST" | "PATCH", body: unknown, quiet = false) {
    setBusy(true);
    if (!quiet) setMessage(null);
    try {
      const res = await fetch("/api/transfers", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed.");
      if (j.transfer) setCurrent(j.transfer);
      await load();
      return j;
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Failed." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const j = await call("POST", { to_outlet_id: Number(outletId), note });
    if (j) {
      setNote("");
      setMessage({ tone: "ok", text: `${j.transfer.code} opened for ${j.transfer.to_outlet}. Scan each tag as it goes into the box.` });
    }
  }

  async function addScan() {
    const sku = scan.trim().toUpperCase();
    setScan("");
    if (!sku || !current) return;
    const j = await call("PATCH", { id: current.id, action: "add", sku });
    if (j) { setMessage({ tone: "ok", text: `Packed ${sku}.` }); setLastScan({ sku, kind: "packed" }); }
    scanRef.current?.focus();
  }

  async function receiveScan() {
    const sku = scan.trim().toUpperCase();
    setScan("");
    if (!sku || !current) return;
    const j = await call("PATCH", { id: current.id, action: "receive_scan", sku });
    if (j?.scan) {
      const kind = j.scan.kind as string;
      setLastScan({ sku, kind });
      setMessage(
        kind === "already" ? { tone: "warn", text: `${sku} was already checked in.` }
        : kind === "unexpected" ? { tone: "warn", text: `${sku} was not on this list — recorded as unexpected and received here.` }
        : kind === "found" ? { tone: "ok", text: `${sku} was flagged missing — now found and received.` }
        : { tone: "ok", text: `${sku} checked in.` },
      );
    }
    scanRef.current?.focus();
  }

  async function dispatch() {
    if (!current) return;
    const n = current.items.length;
    if (!window.confirm(`Dispatch ${current.code} to ${current.to_outlet} with ${n} garment${n === 1 ? "" : "s"}${boxes ? ` in ${boxes} box${boxes === "1" ? "" : "es"}` : ""}? Nothing can be added after this.`)) return;
    const j = await call("PATCH", { id: current.id, action: "dispatch", boxes: boxes ? Number(boxes) : null, carrier });
    if (j) { setBoxes(""); setCarrier(""); setMessage({ tone: "ok", text: `${current.code} is in transit to ${current.to_outlet}. Print the packing list for the box.` }); }
  }

  async function closeReceiving() {
    if (!current) return;
    const checked = current.items.filter((l) => l.received_at).length;
    const missing = current.items.filter((l) => !l.received_at && !l.unexpected);
    const text = missing.length
      ? `${checked} of ${current.items.length} checked in. ${missing.length} garment${missing.length === 1 ? " was" : "s were"} NOT scanned and will be flagged MISSING:\n\n${missing.slice(0, 15).map((l) => l.sku).join(", ")}${missing.length > 15 ? "…" : ""}\n\nHave you scanned everything in the box? Close receiving?`
      : `All ${checked} garments checked in. Close ${current.code}?`;
    if (!window.confirm(text)) return;
    const j = await call("PATCH", { id: current.id, action: "close_receiving", confirm: true });
    if (j?.reconciliation) {
      const r = j.reconciliation as { received: string[]; missing: string[]; unexpected: string[] };
      setMessage({ tone: r.missing.length ? "warn" : "ok", text: `${current.code} received: ${r.received.length + r.unexpected.length} checked in${r.missing.length ? `, ${r.missing.length} missing` : ""}${r.unexpected.length ? `, ${r.unexpected.length} not on the list` : ""}. Garments are in the stockroom — the POS floors them.` });
    }
  }

  async function pushToPos(t: Transfer) {
    const skus = t.items.filter((l) => l.received_at && l.status !== "sold").map((l) => l.sku);
    if (!skus.length || !window.confirm(`Upload ${skus.length} received garments to the Shopify POS for ${t.to_outlet}? They will be stocked at that outlet's Shopify location only.`)) return;
    setPushing({ total: skus.length, done: 0, failed: [] });
    for (let i = 0; i < skus.length; i += 25) {
      const batch = skus.slice(i, i + 25);
      try {
        const res = await fetch("/api/shopify/push-bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ skus: batch, visibility: "pos" }) });
        const j = await res.json();
        const bad = res.ok ? (j.results as { ok: boolean; sku: string; error?: string }[]).filter((r) => !r.ok).map((r) => `${r.sku}: ${r.error}`) : batch.map((s) => `${s}: ${j.error ?? "failed"}`);
        setPushing((p) => p && { ...p, done: p.done + batch.length, failed: [...p.failed, ...bad] });
      } catch (e) { setPushing((p) => p && { ...p, done: p.done + batch.length, failed: [...p.failed, ...batch.map((s) => `${s}: ${e instanceof Error ? e.message : "failed"}`)] }); }
    }
    setPushing((p) => { if (p) setMessage(p.failed.length ? { tone: "warn", text: `${p.total - p.failed.length} uploaded to Shopify POS · ${p.failed.length} failed: ${p.failed.slice(0, 3).join("; ")}` } : { tone: "ok", text: `${p.total} garments uploaded to the Shopify POS for ${t.to_outlet}.` }); return null; });
  }

  if (!transfers) return <p className="text-muted-foreground">Loading…</p>;
  const active = transfers.filter((t) => t.status !== "received");
  const closed = transfers.filter((t) => t.status === "received").slice(0, 20);
  const c = current;
  const checked = c ? c.items.filter((l) => l.received_at).length : 0;
  const expected = c ? c.items.filter((l) => !l.unexpected).length : 0;
  const missingNow = c ? c.items.filter((l) => l.missing) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transfers</h1>
        <p className="text-sm text-muted-foreground">Pack a box by scanning every tag, dispatch it, and the outlet scans every garment back out of the box. Anything missing is flagged. Received garments wait in the stockroom until the POS scans them onto the floor.</p>
      </div>
      {message && <p className={cn("rounded-md border p-3 text-sm", message.tone === "error" ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200" : message.tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-muted")}>{message.text}</p>}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">New transfer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="to">To outlet</Label>
                <select id="to" value={outletId} onChange={(e) => setOutletId(e.target.value)} className="h-11 rounded-md border border-input bg-transparent px-3 text-base">
                  <option value="">— choose —</option>
                  {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5"><Label htmlFor="note">Note</Label><Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Winter drop" /></div>
              <Button size="lg" className="w-full" disabled={busy || !outletId} onClick={create}>Start packing</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Open transfers</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {active.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nothing being packed or on the road.</p>}
              {active.map((t) => (
                <button key={t.id} onClick={() => { setCurrent(t); setMessage(null); setLastScan(null); }} className={cn("flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted", c?.id === t.id && "bg-muted font-semibold")}>
                  <span className="min-w-0 truncate"><span className="font-mono text-xs">{t.code}</span> · {t.to_outlet}</span>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-normal", t.status === "dispatched" && "border-sky-500 text-sky-700 dark:text-sky-300", t.status === "receiving" && "border-amber-500 text-amber-700 dark:text-amber-300")}>{t.items.length} · {TRANSFER_LABEL[t.status]}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {c ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span><span className="font-mono">{c.code}</span> → {c.to_outlet}</span>
                  <span className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline"><a href={`/transfers/${c.id}/print`} target="_blank" rel="noreferrer"><Printer className="size-4" /> Packing list</a></Button>
                    {c.status === "dispatched" && <Button size="sm" disabled={busy} onClick={() => call("PATCH", { id: c.id, action: "start_receiving" })}><PackageOpen className="size-4" /> Start receiving</Button>}
                    {c.status === "receiving" && <Button size="sm" disabled={busy} variant={checked === expected ? "default" : "outline"} onClick={closeReceiving}><ClipboardCheck className="size-4" /> Close receiving</Button>}
                    {c.status === "received" && canPush && <Button size="sm" disabled={busy || pushing != null || checked === 0} onClick={() => pushToPos(c)}><Globe className="size-4" /> {pushing ? `Uploading ${pushing.done}/${pushing.total}…` : `Upload ${checked} to Shopify POS`}</Button>}
                  </span>
                </CardTitle>
                <ol className="mt-3 flex flex-wrap gap-1 text-xs">
                  {TRANSFER_STEPS.map((s, i) => {
                    const at = TRANSFER_STEPS.indexOf(c.status);
                    const stamp = s === "packing" ? `${when(c.created_at)} · ${c.created_by}` : s === "dispatched" ? (c.sent_at ? `${when(c.sent_at)} · ${c.dispatched_by}${c.boxes ? ` · ${c.boxes} box${c.boxes === 1 ? "" : "es"}` : ""}${c.carrier ? ` · ${c.carrier}` : ""}` : "") : s === "receiving" ? when(c.receiving_started_at) : c.received_at ? `${when(c.received_at)} · ${c.received_by}` : "";
                    return (
                      <li key={s} className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1", i < at && "border-green-600 text-green-700 dark:text-green-400", i === at && "border-foreground bg-foreground text-background font-semibold", i > at && "text-muted-foreground")}>
                        {i < at && <Check className="size-3" />}{TRANSFER_LABEL[s]}{stamp && <span className={cn("font-normal", i === at ? "opacity-80" : "text-muted-foreground")}> · {stamp}</span>}
                      </li>
                    );
                  })}
                </ol>
              </CardHeader>
              <CardContent className="space-y-4">
                {c.status === "packing" && (
                  <>
                    <form onSubmit={(e) => { e.preventDefault(); void addScan(); }} className="flex gap-2">
                      <div className="relative flex-1">
                        <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                        <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan each tag as it goes into the box, then Enter" className="h-12 pl-10 text-base" autoComplete="off" autoCapitalize="characters" />
                      </div>
                      <Button type="submit" size="lg" disabled={busy || !scan.trim()}>Pack</Button>
                    </form>
                    <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                      <div className="grid gap-1"><Label htmlFor="boxes" className="text-xs">Boxes</Label><Input id="boxes" inputMode="numeric" value={boxes} onChange={(e) => setBoxes(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 2" className="h-10 w-24" /></div>
                      <div className="grid flex-1 gap-1"><Label htmlFor="carrier" className="text-xs">Carrier / driver</Label><Input id="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. TCS, or the driver's name" className="h-10" /></div>
                      <Button size="lg" disabled={busy || c.items.length === 0} onClick={dispatch}><Truck className="size-4" /> Dispatch {c.items.length}</Button>
                    </div>
                  </>
                )}
                {c.status === "dispatched" && <p className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">In transit to {c.to_outlet}. When the box arrives, press <span className="font-semibold">Start receiving</span> and scan every garment out of it.</p>}
                {(c.status === "receiving" || (c.status === "received" && missingNow.length > 0)) && (
                  <form onSubmit={(e) => { e.preventDefault(); void receiveScan(); }} className="flex gap-2">
                    <div className="relative flex-1">
                      <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                      <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder={c.status === "received" ? "A missing garment turned up? Scan it here" : "Scan each garment as it comes out of the box, then Enter"} className="h-12 pl-10 text-base" autoComplete="off" autoCapitalize="characters" />
                    </div>
                    <Button type="submit" size="lg" disabled={busy || !scan.trim()}>Check in</Button>
                  </form>
                )}
                {c.status === "receiving" && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm"><span className="font-semibold">{checked} of {expected} checked in</span><span className="text-muted-foreground">{expected - checked} to go{c.items.some((l) => l.unexpected) ? ` · ${c.items.filter((l) => l.unexpected).length} not on the list` : ""}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full transition-all", checked === expected ? "bg-green-600" : "bg-sky-500")} style={{ width: `${expected ? (100 * checked) / expected : 0}%` }} /></div>
                  </div>
                )}
                {c.status === "received" && (
                  <div className={cn("rounded-md border p-3 text-sm", (c.missing_count ?? 0) > 0 ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950" : "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950")}>
                    <div className="font-semibold">Reconciliation · closed {when(c.received_at)} by {c.received_by}</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>Sent: <b>{expected}</b></span>
                      <span>Checked in: <b>{checked}</b></span>
                      <span className={cn((c.missing_count ?? 0) > 0 && "text-red-700 dark:text-red-300")}>Missing: <b>{c.missing_count ?? 0}</b></span>
                      {(c.unexpected_count ?? 0) > 0 && <span className="text-amber-800 dark:text-amber-300">Not on the list: <b>{c.unexpected_count}</b></span>}
                      <span>Floored: <b>{c.items.filter((l) => l.status === "on_floor").length}</b></span>
                    </div>
                    {missingNow.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Still missing: {missingNow.map((l) => l.sku).join(", ")}. These show as <i>Missing</i> on Items until they are scanned in here.</p>}
                  </div>
                )}
                {c.items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No garments yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">SKU</th><th className="pb-2">Garment</th><th className="pb-2">Size</th><th className="pb-2 text-right">Price</th>{c.status !== "packing" && <th className="pb-2 pl-3">Check-in</th>}{c.status === "packing" && <th />}</tr></thead>
                    <tbody className="divide-y">
                      {c.items.map((l) => (
                        <tr key={l.id} className={cn(lastScan?.sku === l.sku && "bg-muted/60", l.missing && "text-red-700 dark:text-red-300")}>
                          <td className="py-1.5 font-mono text-xs">{l.sku}</td>
                          <td className="py-1.5">{l.brand || "Unbranded"} · {l.sub_category}{l.unexpected && <span className="ml-2 rounded-full border border-amber-500 px-1.5 text-[10px] uppercase text-amber-700 dark:text-amber-300">not on list</span>}</td>
                          <td className="py-1.5">{l.size_label ?? "—"}</td>
                          <td className="py-1.5 text-right tabular-nums">{l.list_price != null ? rs(l.list_price) : "—"}</td>
                          {c.status !== "packing" && (
                            <td className="py-1.5 pl-3 text-xs">
                              {l.received_at ? <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400"><Check className="size-3.5" />{l.found_at ? "found" : "in"} {when(l.received_at)}{l.status === "on_floor" ? ` · floored ${l.floored_on}` : ""}</span>
                                : l.missing ? <span className="inline-flex items-center gap-1 font-semibold"><AlertTriangle className="size-3.5" /> missing</span>
                                : c.status === "received" ? <span className="text-muted-foreground">—</span>
                                : <span className="text-muted-foreground">not yet</span>}
                            </td>
                          )}
                          {c.status === "packing" && <td className="py-1.5 text-right"><button className="rounded p-1 hover:bg-muted" disabled={busy} onClick={() => call("PATCH", { id: c.id, action: "remove", sku: l.sku })} aria-label={`Remove ${l.sku}`}><X className="size-4" /></button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="text-xs text-muted-foreground">{c.items.length} garment{c.items.length === 1 ? "" : "s"} · {rs(c.items.reduce((s, l) => s + (l.list_price ?? 0), 0))} at list price{c.note ? ` · ${c.note}` : ""}</p>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Start packing a new transfer or pick an open one.</CardContent></Card>
          )}

          {closed.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Received recently</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {closed.map((t) => (
                      <tr key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setCurrent(t); setMessage(null); setLastScan(null); }}>
                        <td className="py-1.5 font-mono text-xs">{t.code}</td>
                        <td className="py-1.5">{t.to_outlet}</td>
                        <td className="py-1.5 text-right text-xs text-muted-foreground">{t.received_count ?? t.items.length} received{(t.missing_count ?? 0) > 0 && <span className="ml-2 rounded-full border border-red-400 px-1.5 text-red-700 dark:text-red-300">{t.missing_count} missing</span>} · {new Date(t.received_at!).toLocaleDateString("en-PK")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
