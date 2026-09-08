"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Brand = { id: number; name: string; tier: string; active: boolean };
const TIERS = [
  { code: "regular", label: "Regular high street", mult: "×1.00" },
  { code: "affordable_luxury", label: "Affordable luxury", mult: "×2.00" },
  { code: "ultra_luxury", label: "Ultra luxury", mult: "manual" },
];

export function BrandsAdmin() {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("regular");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = () => fetch("/api/admin/brands").then((r) => r.json()).then((j) => setBrands(j.brands ?? []));
  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(() => (brands ?? []).filter((b) => b.name.toLowerCase().includes(q.toLowerCase())), [brands, q]);
  const counts = useMemo(() => TIERS.map((t) => ({ ...t, n: (brands ?? []).filter((b) => b.tier === t.code).length })), [brands]);

  async function post(body: unknown, csvMode = false) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/brands${csvMode ? "?csv=1" : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed.");
      setMessage({ tone: "ok", text: `Saved ${j.upserted} brand${j.upserted === 1 ? "" : "s"}${j.rejected?.length ? ` · skipped ${j.rejected.length}: ${j.rejected.slice(0, 5).join(", ")}` : ""}.` });
      await load();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Failed." });
    } finally {
      setBusy(false);
    }
  }

  if (!brands) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brands</h1>
        <p className="text-sm text-muted-foreground">Tier is resolved from this list, never judged by the tagger. Unknown brands price as Regular with a warning.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {counts.map((t) => (
          <div key={t.code} className="rounded-xl border bg-background p-4">
            <div className="text-xs uppercase text-muted-foreground">{t.label} · {t.mult}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{t.n}</div>
          </div>
        ))}
      </div>
      {brands.length < 384 && (
        <p className="rounded-md border border-amber-600 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {brands.length} of the spec&apos;s 384 brands are loaded. Paste <code>Khazanay_brand_tiers.csv</code> below to import the rest.
        </p>
      )}
      {message && <p className={cn("rounded-md border p-3 text-sm", message.tone === "ok" ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "border-red-600 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300")}>{message.text}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>All brands</span>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="h-8 w-48" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Brand</th><th className="pb-2">Tier</th></tr></thead>
                <tbody className="divide-y">
                  {shown.map((b) => (
                    <tr key={b.id} className={cn(!b.active && "opacity-50")}>
                      <td className="py-1.5">{b.name}</td>
                      <td className="py-1.5">
                        <select value={b.tier} disabled={busy} onChange={(e) => post({ brands: [{ name: b.name, tier: e.target.value, active: b.active }] })} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
                          {TIERS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Add a brand</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5"><Label htmlFor="bn">Name</Label><Input id="bn" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="grid gap-1.5">
                <Label htmlFor="bt">Tier</Label>
                <select id="bt" value={tier} onChange={(e) => setTier(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                  {TIERS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </div>
              <Button disabled={!name.trim() || busy} onClick={() => post({ brands: [{ name, tier }] }).then(() => setName(""))}>Add</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Import CSV</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Columns: Brand, Tier — the header row is skipped. Existing names are updated, new ones added.</p>
              <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} placeholder={"Brand,Tier\nZara,Regular\nNike,Affordable Luxury\nGucci,Ultra Luxury"} className="font-mono text-xs" />
              <Button variant="outline" disabled={!csv.trim() || busy} onClick={() => post({ csv }, true).then(() => setCsv(""))}>Import</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
