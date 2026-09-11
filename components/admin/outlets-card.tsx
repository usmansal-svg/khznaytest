"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Outlet = { id: number; name: string; city: string | null; is_online: boolean; active: boolean; shopify_location_id: string | null };
type Loc = { id: string; name: string; active: boolean };

/** Outlets: rename, switch off, and map each to the Shopify location its Shopify POS sells from. */
export function OutletsCard() {
  const [data, setData] = useState<{ outlets: Outlet[]; locations: Loc[]; shopify_connected: boolean; shopify_error: string | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await fetch("/api/admin/outlets"); const j = await r.json(); if (r.ok) setData(j); else setMsg(j.error); }, []);
  useEffect(() => { void load(); }, [load]);
  async function save(id: number, patch: Record<string, unknown>) {
    const r = await fetch("/api/admin/outlets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const j = await r.json(); setMsg(r.ok ? "Saved." : j.error); void load();
  }
  if (!data) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Outlets <span className="font-normal text-muted-foreground">· names and Shopify locations</span></CardTitle>
        <p className="text-xs text-muted-foreground">Each outlet&apos;s Shopify POS sells from one Shopify location. Map it here so a garment received at that outlet is stocked at that location when it is put on Shopify.{data.shopify_connected ? "" : " Shopify is not connected yet, so location IDs must be pasted by hand."}{data.shopify_error ? ` (${data.shopify_error})` : ""}</p>
      </CardHeader>
      <CardContent>
        {msg && <p className="mb-2 text-xs text-muted-foreground">{msg}</p>}
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-1">Name</th><th className="pb-1">Shopify location</th><th className="pb-1"></th></tr></thead>
          <tbody className="divide-y">
            {data.outlets.map((o) => (
              <tr key={o.id} className={o.active ? "" : "opacity-50"}>
                <td className="py-1.5 pr-2"><Input defaultValue={o.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== o.name) void save(o.id, { name: v }); }} className="h-8 w-40" />{o.is_online && <span className="ml-1 text-[10px] text-muted-foreground">online</span>}</td>
                <td className="py-1.5 pr-2">
                  {data.locations.length ? (
                    <select value={o.shopify_location_id ?? ""} onChange={(e) => save(o.id, { shopify_location_id: e.target.value || null })} className="h-8 max-w-[16rem] rounded-md border border-input bg-transparent px-2 text-sm"><option value="">— store default —</option>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.active ? "" : " (inactive)"}</option>)}</select>
                  ) : (
                    <Input defaultValue={o.shopify_location_id ?? ""} placeholder="gid://shopify/Location/…" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (o.shopify_location_id ?? "")) void save(o.id, { shopify_location_id: v || null }); }} className="h-8 w-64 font-mono text-xs" />
                  )}
                </td>
                <td className="py-1.5 text-right"><Button size="sm" variant="ghost" onClick={() => save(o.id, { active: !o.active })}>{o.active ? "Switch off" : "Switch on"}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
