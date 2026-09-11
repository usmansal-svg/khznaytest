"use client";

import { useCallback, useEffect, useState } from "react";
import { PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pkr, usePos, when } from "@/components/pos/pos-context";

type Transfer = { id: number; code: string; status: string; sent_at: string | null; note: string | null; garments: { sku: string; brand: string | null; grade: string; size: string | null; price: number; sub_category: string }[] };

/** Stock arrives as a transfer from the warehouse. Receiving it puts every garment on the floor here, today, in this month's colour. */
export function ReceivePage() {
  const { api, reload } = usePos();
  const [data, setData] = useState<{ incoming: Transfer[]; recent: { id: number; code: string; received_at: string; count: number }[] } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<number | string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => { const r = await api("/api/pos/receive"); const j = await r.json(); if (r.ok) setData(j); else setMsg({ ok: false, text: j.error }); }, [api]);
  useEffect(() => { void load(); }, [load]);
  async function receive(body: { transfer_id?: number; code?: string }) {
    setBusy(body.transfer_id ?? body.code ?? "x"); setMsg(null);
    const r = await api("/api/pos/receive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setMsg(r.ok ? { ok: true, text: `${j.code} received — ${j.floored} garment${j.floored === 1 ? "" : "s"} on the floor from today (${j.colour} sticker month).` } : { ok: false, text: j.error });
    setBusy(null); setCode(""); await load(); void reload();
  }
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div><h1 className="text-2xl font-bold">Receive stock</h1><p className="text-sm text-muted-foreground">Check the box against the sheet, then receive. Every garment goes on the floor from today and its markdown clock starts.</p></div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void receive({ code: code.trim() }); }}>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan or type the transfer code on the sheet, e.g. TR-0007" className="h-12 font-mono" autoComplete="off" autoCapitalize="characters" />
        <Button type="submit" className="h-12" disabled={!code.trim() || busy != null}>Receive</Button>
      </form>
      {msg && <p className={`rounded-md border p-3 text-sm ${msg.ok ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "border-red-400 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>{msg.text}</p>}
      {!data ? <p className="text-muted-foreground">Loading…</p> : data.incoming.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nothing on its way. Transfers appear here when the warehouse marks them sent.</CardContent></Card>
      ) : data.incoming.map((t) => (
        <Card key={t.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              <span><span className="font-mono">{t.code}</span> <span className="font-normal text-muted-foreground">· {t.garments.length} garments · {t.status === "sent" ? `sent ${when(t.sent_at)}` : "still being packed"}{t.note ? ` · ${t.note}` : ""}</span></span>
              <Button size="sm" disabled={busy != null || t.status !== "sent"} onClick={() => receive({ transfer_id: t.id })}><PackageCheck className="size-4" /> {busy === t.id ? "Receiving…" : "Receive all"}</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-1">SKU</th><th className="pb-1">Garment</th><th className="pb-1">Brand</th><th className="pb-1">Size</th><th className="pb-1 text-right">Price</th></tr></thead>
              <tbody className="divide-y">{t.garments.map((g) => <tr key={g.sku}><td className="py-1 font-mono text-xs">{g.sku}</td><td className="py-1">{g.sub_category}</td><td className="py-1">{g.brand ?? "—"}</td><td className="py-1">{g.size ?? "—"}</td><td className="py-1 text-right tabular-nums">{pkr(g.price)}</td></tr>)}</tbody>
            </table>
          </CardContent>
        </Card>
      ))}
      {data && data.recent.length > 0 && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Recently received</CardTitle></CardHeader><CardContent><ul className="text-sm">{data.recent.map((r) => <li key={r.id} className="flex justify-between py-1"><span className="font-mono text-xs">{r.code}</span><span className="text-muted-foreground">{r.count} garments · {when(r.received_at)}</span></li>)}</ul></CardContent></Card>
      )}
    </div>
  );
}
