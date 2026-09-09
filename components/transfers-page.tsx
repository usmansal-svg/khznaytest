"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, ScanLine, Send, PackageCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Line = { id: number; sku: string; brand: string; sub_category: string; grade: string; size_label: string | null; list_price: number | null; status: string; qc?: boolean };
type Transfer = { id: number; code: string; to_outlet_id: number; to_outlet: string; status: "open" | "sent" | "received"; created_at: string; sent_at: string | null; received_at: string | null; note: string | null; items: Line[] };
type Outlet = { id: number; name: string; is_online: boolean };

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/**
 * Build a shipment by scanning tags, print the sheet, send it, and the
 * outlet marks it received. Scanner guns type the SKU and press Enter.
 */
export function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [current, setCurrent] = useState<Transfer | null>(null);
  const [outletId, setOutletId] = useState("");
  const [note, setNote] = useState("");
  const [scan, setScan] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  async function load() {
    const j = await (await fetch("/api/transfers")).json();
    setTransfers(j.transfers ?? []);
    if (current) setCurrent((j.transfers as Transfer[]).find((t) => t.id === current.id) ?? null);
  }
  useEffect(() => {
    void load();
    fetch("/api/reference").then((r) => r.json()).then((j) => setOutlets((j.outlets ?? []).filter((o: Outlet) => !o.is_online)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (current?.status === "open") scanRef.current?.focus();
  }, [current]);

  async function call(method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/transfers", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed.");
      if (j.transfer) setCurrent(j.transfer);
      await load();
      return j;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const j = await call("POST", { to_outlet_id: Number(outletId), note });
    if (j) {
      setNote("");
      setMessage(`${j.transfer.code} opened for ${j.transfer.to_outlet}. Scan tags to add garments.`);
    }
  }

  async function addScan() {
    const sku = scan.trim();
    setScan("");
    if (!sku || !current) return;
    const j = await call("PATCH", { id: current.id, action: "add", sku });
    if (j) setMessage(`Added ${sku.toUpperCase()}.`);
    scanRef.current?.focus();
  }

  if (!transfers) return <p className="text-muted-foreground">Loading…</p>;
  const open = transfers.filter((t) => t.status === "open");
  const sent = transfers.filter((t) => t.status === "sent");
  const received = transfers.filter((t) => t.status === "received").slice(0, 20);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transfers</h1>
        <p className="text-sm text-muted-foreground">Ship tagged garments to an outlet. Scan each tag onto a transfer, print the sheet, send. The outlet marks it received and every garment&apos;s location updates.</p>
      </div>
      {message && <p className="rounded-md border bg-muted p-3 text-sm">{message}</p>}

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
              <div className="grid gap-1.5"><Label htmlFor="note">Note</Label><Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Winter drop, 2 boxes" /></div>
              <Button size="lg" className="w-full" disabled={busy || !outletId} onClick={create}>Open transfer</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">In progress</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {[...open, ...sent].length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nothing in transit.</p>}
              {[...open, ...sent].map((t) => (
                <button key={t.id} onClick={() => setCurrent(t)} className={cn("flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted", current?.id === t.id && "bg-muted font-semibold")}>
                  <span><span className="font-mono text-xs">{t.code}</span> · {t.to_outlet}</span>
                  <span className="text-xs text-muted-foreground">{t.items.length} · {t.status}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {current ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span><span className="font-mono">{current.code}</span> → {current.to_outlet} <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal capitalize">{current.status}</span></span>
                  <span className="flex gap-2">
                    <Button asChild size="sm" variant="outline"><a href={`/transfers/${current.id}/print`} target="_blank" rel="noreferrer"><Printer className="size-4" /> Sheet</a></Button>
                    {current.status === "open" && <Button size="sm" disabled={busy || current.items.length === 0} onClick={() => call("PATCH", { id: current.id, action: "send" })}><Send className="size-4" /> Send</Button>}
                    {current.status !== "received" && <Button size="sm" variant="outline" disabled={busy || current.items.length === 0} onClick={() => call("PATCH", { id: current.id, action: "receive" })}><PackageCheck className="size-4" /> Mark received</Button>}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {current.status === "open" && (
                  <form onSubmit={(e) => { e.preventDefault(); void addScan(); }} className="flex gap-2">
                    <div className="relative flex-1">
                      <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                      <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan or type a SKU, then Enter" className="h-12 pl-10 text-base" autoComplete="off" autoCapitalize="characters" />
                    </div>
                    <Button type="submit" size="lg" disabled={busy || !scan.trim()}>Add</Button>
                  </form>
                )}
                {current.items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No garments yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">SKU</th><th className="pb-2">Garment</th><th className="pb-2">Size</th><th className="pb-2 text-right">Price</th>{current.status === "open" && <th />}</tr></thead>
                    <tbody className="divide-y">
                      {current.items.map((l) => (
                        <tr key={l.id}>
                          <td className="py-1.5 font-mono text-xs">{l.sku}</td>
                          <td className="py-1.5">{l.brand || "Unbranded"} · {l.sub_category}</td>
                          <td className="py-1.5">{l.size_label ?? "—"}</td>
                          <td className="py-1.5 text-right tabular-nums">{l.list_price != null ? rs(l.list_price) : "—"}</td>
                          {current.status === "open" && <td className="py-1.5 text-right"><button className="rounded p-1 hover:bg-muted" disabled={busy} onClick={() => call("PATCH", { id: current.id, action: "remove", sku: l.sku })}><X className="size-4" /></button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="text-xs text-muted-foreground">{current.items.length} garment{current.items.length === 1 ? "" : "s"} · {rs(current.items.reduce((s, l) => s + (l.list_price ?? 0), 0))} at list price</p>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Open a transfer or pick one in progress.</CardContent></Card>
          )}

          {received.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Received recently</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {received.map((t) => (
                      <tr key={t.id}><td className="py-1.5 font-mono text-xs">{t.code}</td><td className="py-1.5">{t.to_outlet}</td><td className="py-1.5 text-right text-xs text-muted-foreground">{t.items.length} garments · {new Date(t.received_at!).toLocaleDateString("en-PK")}</td></tr>
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
