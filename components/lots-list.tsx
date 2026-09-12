"use client";

import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Lot = { id: number; code: string; description: string | null; pieces: number | null; status: string; created_at: string; tagged: number; rejects: number; pct_done: number | null };

/** Read-only: lots come from the commercial software; here they are only a number, a description and a quantity to tag against. */
export function LotsList() {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/lots").then((r) => r.json()).then((j) => (j.error ? setError(j.error) : setLots(j.lots))).catch(() => setError("Could not load lots.")); }, []);
  const open = (lots ?? []).filter((l) => l.status === "open"), rest = (lots ?? []).filter((l) => l.status !== "open");
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lots</h1>
        <p className="text-sm text-muted-foreground">Lots are recorded in the commercial software (supplier, cost, P&amp;L live there). This list shows each lot&apos;s number, description and quantity, and how much of it has been tagged. Taggers pick the lot on the tag form.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!lots ? <p className="text-muted-foreground">Loading…</p> : (
        <Card><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Lot</th><th className="p-2">Description</th><th className="p-2 text-right">Quantity</th><th className="p-2 text-right">Tagged</th><th className="p-2 text-right">Rejects</th><th className="p-2 w-40">Progress</th><th className="p-2">Status</th><th className="p-2">Recorded</th></tr></thead>
            <tbody className="divide-y">
              {[...open, ...rest].map((l) => (
                <tr key={l.id} className={cn(l.status !== "open" && "opacity-60")}>
                  <td className="p-2 font-mono text-xs">{l.code}</td>
                  <td className="p-2">{l.description ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2 text-right tabular-nums">{l.pieces ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">{l.tagged}</td>
                  <td className="p-2 text-right tabular-nums">{l.rejects}</td>
                  <td className="p-2">{l.pct_done == null ? <span className="text-xs text-muted-foreground">no quantity</span> : <div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded bg-muted"><div className={cn("h-1.5 rounded", l.pct_done >= 0.85 ? "bg-amber-500" : "bg-foreground/70")} style={{ width: `${l.pct_done * 100}%` }} /></div><span className="w-10 text-right text-xs tabular-nums">{Math.round(l.pct_done * 100)}%</span></div>}</td>
                  <td className="p-2 capitalize">{l.status}</td>
                  <td className="p-2 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString("en-PK")}</td>
                </tr>
              ))}
              {lots.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No lots recorded yet. Add them in the commercial software.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}
