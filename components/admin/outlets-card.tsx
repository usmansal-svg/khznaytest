"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Outlet = { id: number; name: string; city: string | null; is_online: boolean; active: boolean; shopify_location_id: string | null };
type Loc = { id: string; name: string; active: boolean };

/**
 * Settings → Outlets: names, cities, add / switch off.
 * Settings → Shopify: connection, each outlet's Shopify location, the order webhook.
 */
export function OutletsCard({ mode }: { mode: "outlets" | "shopify" }) {
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  async function create() {
    const r = await fetch("/api/admin/outlets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", name: newName, city: newCity }) });
    const j = await r.json(); setMsg(r.ok ? `${newName.trim()} added.` : j.error); if (r.ok) { setNewName(""); setNewCity(""); } void load();
  }
  const [data, setData] = useState<{ outlets: Outlet[]; locations: Loc[]; shopify_connected: boolean; shopify_error: string | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await fetch("/api/admin/outlets"); const j = await r.json(); if (r.ok) setData(j); else setMsg(j.error); }, []);
  useEffect(() => { void load(); }, [load]);
  async function save(id: number, patch: Record<string, unknown>) {
    const r = await fetch("/api/admin/outlets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const j = await r.json(); setMsg(r.ok ? "Saved." : j.error); void load();
  }
  async function registerWebhook() {
    setMsg("Registering…");
    const r = await fetch("/api/admin/outlets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "register_webhook" }) });
    const j = await r.json();
    setMsg(r.ok ? (j.created ? "Order webhook registered with Shopify. Sales on any Shopify POS or the website now mark garments sold here." : "Order webhook was already registered.") : j.error);
  }
  if (!data) return null;
  if (mode === "outlets") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Outlets</CardTitle>
          <p className="text-xs text-muted-foreground">Where garments are sent and sold. Switching an outlet off hides it from transfers and staff without losing its history. The online outlet is the website; its Shopify location is the warehouse.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-1">Name</th><th className="pb-1">City</th><th className="pb-1">Shopify location</th><th className="pb-1"></th></tr></thead>
            <tbody className="divide-y">
              {data.outlets.map((o) => (
                <tr key={o.id} className={o.active ? "" : "opacity-50"}>
                  <td className="py-1.5 pr-2"><Input defaultValue={o.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== o.name) void save(o.id, { name: v }); }} className="h-8 w-44" />{o.is_online && <span className="ml-1 text-[10px] text-muted-foreground">online</span>}</td>
                  <td className="py-1.5 pr-2"><Input defaultValue={o.city ?? ""} placeholder="City" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (o.city ?? "")) void save(o.id, { city: v }); }} className="h-8 w-36" /></td>
                  <td className="py-1.5 pr-2 text-xs text-muted-foreground">{data.locations.find((l) => l.id === o.shopify_location_id)?.name ?? (o.shopify_location_id ? "mapped" : "store default")}</td>
                  <td className="py-1.5 text-right"><Button size="sm" variant="ghost" onClick={() => save(o.id, { active: !o.active })}>{o.active ? "Switch off" : "Switch on"}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
            <div className="grid gap-1"><span className="text-xs text-muted-foreground">New outlet</span><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Lahore DHA" className="h-9 w-48" /></div>
            <div className="grid gap-1"><span className="text-xs text-muted-foreground">City</span><Input value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="Lahore" className="h-9 w-36" /></div>
            <Button type="submit" size="sm" className="h-9" disabled={newName.trim().length < 2}>Add outlet</Button>
          </form>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Shopify <span className="font-normal text-muted-foreground">· {data.shopify_connected ? "connected" : "not connected"}</span></CardTitle>
        <p className="text-xs text-muted-foreground">Each outlet&apos;s Shopify POS sells from one Shopify location. Map it here so a garment received at that outlet is stocked at that location when it is put on Shopify.{data.shopify_connected ? "" : " Shopify is not connected yet, so location IDs must be pasted by hand."}{data.shopify_error ? ` (${data.shopify_error})` : ""}</p>
      </CardHeader>
      <CardContent>
        {msg && <p className="mb-2 text-xs text-muted-foreground">{msg}</p>}
        {data.shopify_connected && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
            <span className="text-muted-foreground">Sales flow back from Shopify through an order webhook the app registers itself.</span>
            <Button size="sm" variant="outline" className="h-8" onClick={registerWebhook}>Register order webhook</Button>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-1">Outlet</th><th className="pb-1">Shopify location</th></tr></thead>
          <tbody className="divide-y">
            {data.outlets.filter((o) => o.active).map((o) => (
              <tr key={o.id}>
                <td className="py-1.5 pr-2">{o.name}{o.is_online && <span className="ml-1 text-[10px] text-muted-foreground">online · warehouse</span>}</td>
                <td className="py-1.5 pr-2">
                  {data.locations.length ? (
                    <select value={o.shopify_location_id ?? ""} onChange={(e) => save(o.id, { shopify_location_id: e.target.value || null })} className="h-8 max-w-[16rem] rounded-md border border-input bg-transparent px-2 text-sm"><option value="">— store default —</option>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.active ? "" : " (inactive)"}</option>)}</select>
                  ) : (
                    <Input defaultValue={o.shopify_location_id ?? ""} placeholder="gid://shopify/Location/…" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (o.shopify_location_id ?? "")) void save(o.id, { shopify_location_id: v || null }); }} className="h-8 w-64 font-mono text-xs" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
