"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Row = { id: number; sku: string; brand: string; sub_category: string; size_label: string | null; list_price: number; colour_tag?: string | null; stage?: string; sticker?: string; price_today?: number; floored_on?: string | null };
type Floor = { colour: string; pending: Row[]; stickers: Row[]; to_pull: Row[]; on_floor: number };
type Outlet = { id: number; name: string; is_online: boolean };

const COLOUR: Record<string, string> = { red: "bg-red-500", blue: "bg-blue-500", green: "bg-green-500", yellow: "bg-yellow-400" };
const STICKER_CLASS: Record<string, string> = { md1: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200", md2: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", md3: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" };
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/**
 * Drop day (the 1st): floor everything tagged for this outlet in this
 * month's colour. Monthly sweep: the sticker list, one type at a time, then
 * pull four-colour-old stock.
 */
export function FloorPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletId] = useState("");
  const [floor, setFloor] = useState<Floor | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  }, [load]);

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
          <h1 className="text-2xl font-bold">Floor</h1>
          <p className="text-sm text-muted-foreground">Drop day on the 1st, sticker sweep once a month, pull what&apos;s four colours old.</p>
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
            <Stat label="Awaiting drop day" value={String(floor.pending.length)} />
            <Stat label="On floor" value={String(floor.on_floor)} />
            <Stat label="Stickers this month" value={String(floor.stickers.length)} />
          </div>

          <Card className="print:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span>Drop day · {floor.pending.length} tagged, not yet on the floor</span>
                <Button disabled={busy || floor.pending.length === 0} onClick={() => act("floor")}>Floor all in {floor.colour}</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {floor.pending.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting. Garments tagged for this outlet appear here until drop day.</p> : (
                <p className="text-sm text-muted-foreground">Attach a <span className="font-semibold capitalize">{floor.colour}</span> sticker to each of these as it goes out, then press Floor all. {floor.pending.slice(0, 8).map((p) => p.sku).join(", ")}{floor.pending.length > 8 ? "…" : ""}</p>
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
