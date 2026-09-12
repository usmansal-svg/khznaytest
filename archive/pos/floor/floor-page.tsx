"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, Printer, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Row = { id: number; sku: string; brand: string; sub_category: string; size_label: string | null; list_price: number; colour_tag?: string | null; stage?: string; sticker?: string; price_today?: number; floored_on?: string | null; received_at?: string | null; on_shopify?: boolean };
type Floor = { colour: string; today: string; pending: Row[]; floored_today: Row[]; in_transit: number; stickers: Row[]; to_pull: Row[]; on_floor: number };
type Outlet = { id: number; name: string; is_online: boolean };

const COLOUR: Record<string, string> = { red: "bg-red-500", blue: "bg-blue-500", green: "bg-green-500", yellow: "bg-yellow-400" };
const STICKER_CLASS: Record<string, string> = { md1: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200", md2: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", md3: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" };
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/**
 * Flooring is its own step after receiving (12 Sep). The stockroom lists what
 * has been received and not yet put out; scanning a tag floors that garment
 * today, in this month's colour, under the scanner's name — or the whole
 * stockroom goes out at once on drop day. Monthly sweep: the sticker list,
 * one type at a time, then pull four-colour-old stock.
 */
export function FloorPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [floor, setFloor] = useState<Floor | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState("");
  const [canPush, setCanPush] = useState(false);
  const [pushing, setPushing] = useState<{ total: number; done: number; failed: string[] } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    const j = await (await fetch(`/api/floor?outlet_id=${id}`)).json();
    if (j.error) setMessage(j.error); else setFloor(j);
  }, []);

  useEffect(() => {
    fetch("/api/reference").then((r) => r.json()).then((j) => {
      const list = (j.outlets ?? []).filter((o: Outlet) => !o.is_online);
      setOutlets(list);
      const first = j.tagger?.outlet_id ?? list[0]?.id;
      if (first) { setOutletId(String(first)); void load(String(first)); }
    });
    fetch("/api/auth/me").then((r) => r.json()).then((j) => setCanPush(["manager", "founder"].includes(j.staff?.role))).catch(() => {});
  }, [load]);

  async function floorScan() {
    const sku = scan.trim().toUpperCase();
    setScan("");
    if (!sku) return;
    setBusy(true);
    try {
      const res = await fetch("/api/floor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "floor", outlet_id: Number(outletId), skus: [sku] }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMessage(j.floored ? `${sku} is on the floor · ${j.colour} tag.` : j.refused?.[0] ?? `${sku} was not floored.`);
      await load(outletId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
      scanRef.current?.focus();
    }
  }

  async function pushFloored() {
    const skus = (floor?.floored_today ?? []).filter((r) => !r.on_shopify).map((r) => r.sku);
    const name = outlets.find((o) => String(o.id) === outletId)?.name ?? "this outlet";
    if (!skus.length || !window.confirm(`Upload ${skus.length} garments floored today to the Shopify POS for ${name}? They will be stocked at that outlet's Shopify location only.`)) return;
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
    setPushing((p) => { if (p) setMessage(p.failed.length ? `${p.total - p.failed.length} uploaded to Shopify POS · ${p.failed.length} failed: ${p.failed.slice(0, 3).join("; ")}` : `${p.total} garments uploaded to the Shopify POS for ${name}.`); return null; });
    await load(outletId);
  }

  async function act(action: "floor" | "pull") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/floor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, outlet_id: Number(outletId) }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMessage(action === "floor" ? `Floored ${j.floored} garment${j.floored === 1 ? "" : "s"} in ${j.colour}.` : `Pulled ${j.pulled} garment${j.pulled === 1 ? "" : "s"} for bulk sale.`);
      await load(outletId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  const groups = floor ? groupBy(floor.stickers, (r) => r.sticker!) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Floor stock</h1>
          <p className="text-sm text-muted-foreground">Scan a received garment to put it on the floor today. Its colour and markdown clock start from the day it is floored, not the day it arrived. Sticker sweep once a month; pull what&apos;s four colours old.</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={outletId} onChange={(e) => { setOutletId(e.target.value); setFloor(null); void load(e.target.value); }} className="h-11 rounded-md border border-input bg-transparent px-3 text-base">
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print sweep</Button>
        </div>
      </div>
      {message && <p className="rounded-md border bg-muted p-3 text-sm print:hidden">{message}</p>}
      {!floor ? <p className="text-muted-foreground">Loading…</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-4 print:hidden">
            <Stat label="This month's colour" value={<span className="flex items-center gap-2 capitalize"><span className={cn("inline-block size-5 rounded-full", COLOUR[floor.colour])} />{floor.colour}</span>} />
            <Stat label="In the stockroom" value={String(floor.pending.length)} />
            <Stat label="On floor" value={<>{floor.on_floor}{floor.in_transit ? <span className="ml-2 text-sm font-normal text-muted-foreground">· {floor.in_transit} box{floor.in_transit === 1 ? "" : "es"} on the way</span> : null}</>} />
            <Stat label="Stickers this month" value={String(floor.stickers.length)} />
          </div>

          <Card className="print:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                <span>Put on the floor · <span className="capitalize">{floor.colour}</span> tag today</span>
                <Button variant="outline" disabled={busy || floor.pending.length === 0} onClick={() => { if (window.confirm(`Floor all ${floor.pending.length} garments in the stockroom today in ${floor.colour}?`)) void act("floor"); }}>Floor the whole stockroom ({floor.pending.length})</Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={(e) => { e.preventDefault(); void floorScan(); }} className="flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan the tag as the garment goes out, then Enter" className="h-12 pl-10 text-base" autoComplete="off" autoCapitalize="characters" />
                </div>
                <Button type="submit" size="lg" disabled={busy || !scan.trim()}>Floor</Button>
              </form>
              <p className="text-xs text-muted-foreground">Attach a <span className="font-semibold capitalize">{floor.colour}</span> sticker to each garment as you scan it. Only received garments can be floored; anything still in transit is refused.</p>
              {floor.floored_today.length > 0 && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">Floored today · {floor.floored_today.length}</span>
                    {canPush && floor.floored_today.some((r) => !r.on_shopify) && (
                      <Button size="sm" disabled={busy || pushing != null} onClick={pushFloored}><Globe className="size-4" /> {pushing ? `Uploading ${pushing.done}/${pushing.total}…` : `Upload ${floor.floored_today.filter((r) => !r.on_shopify).length} to Shopify POS`}</Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{floor.floored_today.slice(0, 12).map((r) => r.sku).join(", ")}{floor.floored_today.length > 12 ? "…" : ""}</p>
                </div>
              )}
              {floor.pending.length === 0 ? <p className="text-sm text-muted-foreground">The stockroom is empty. Garments appear here once a transfer to this outlet has been received.</p> : (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Stockroom · {floor.pending.length} received, not yet on the floor</div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {floor.pending.map((l) => (
                        <tr key={l.id}><td className="py-1 font-mono text-xs">{l.sku}</td><td className="py-1">{l.brand || "Unbranded"} · {l.sub_category}</td><td className="py-1">{l.size_label ?? "—"}</td><td className="py-1 text-right tabular-nums">{rs(l.list_price)}</td><td className="py-1 text-right text-xs text-muted-foreground">received {l.received_at ? new Date(l.received_at).toLocaleDateString("en-PK") : "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Monthly sweep · {outlets.find((o) => String(o.id) === outletId)?.name} · {new Date().toLocaleDateString("en-PK", { month: "long", year: "numeric" })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {groups.length === 0 && <p className="text-sm text-muted-foreground">No stickers due — nothing on the floor is a colour back yet.</p>}
              {groups.map(([sticker, rows]) => (
                <div key={sticker}>
                  <h3 className={cn("mb-2 inline-block rounded px-2 py-1 text-sm font-bold", STICKER_CLASS[rows[0].stage!])}>{sticker} · {rows.length}</h3>
                  {groupBy(rows, (r) => r.sub_category).map(([sub, lines]) => (
                    <div key={sub} className="mb-3">
                      <div className="text-xs font-semibold uppercase text-muted-foreground">{sub} · {lines.length}</div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y">
                          {lines.map((l) => (
                            <tr key={l.id}><td className="py-1 font-mono text-xs">{l.sku}</td><td className="py-1">{l.brand || "Unbranded"}</td><td className="py-1">{l.size_label ?? "—"}</td><td className="py-1 capitalize">{l.colour_tag}</td><td className="py-1 text-right tabular-nums text-muted-foreground line-through">{rs(l.list_price)}</td><td className="py-1 text-right font-semibold tabular-nums">{rs(l.price_today!)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="print:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span>Pull · {floor.to_pull.length} four colours back</span>
                <Button variant="destructive" disabled={busy || floor.to_pull.length === 0} onClick={() => act("pull")}>Pull all</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {floor.to_pull.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due. Their colour is reused for this month&apos;s drop, so pull before flooring.</p> : (
                <table className="w-full text-sm"><tbody className="divide-y">{floor.to_pull.map((l) => <tr key={l.id}><td className="py-1 font-mono text-xs">{l.sku}</td><td className="py-1">{l.brand || "Unbranded"} · {l.sub_category}</td><td className="py-1 capitalize">{l.colour_tag}</td><td className="py-1 text-right text-xs text-muted-foreground">floored {l.floored_on}</td></tr>)}</tbody></table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function groupBy<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  return [...m.entries()];
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border bg-background p-4"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums">{value}</div></div>;
}
