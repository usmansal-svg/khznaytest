"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Brand = { id: number; name: string; tier: string; active: boolean; source: string; added_at: string; added_by: string | null; quick_pick_order: number | null };
const TIERS = [
  { code: "regular", label: "High street", mult: "×1.00", note: "Standard price" },
  { code: "affordable_luxury", label: "Affordable luxury", mult: "×2.00", note: "Roughly double" },
  { code: "ultra_luxury", label: "Ultra luxury", mult: "manual", note: "Set aside, priced by hand" },
];

export function BrandsAdmin() {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("regular");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = () => fetch("/api/admin/brands").then((r) => r.json()).then((j) => setBrands(j.brands ?? []));
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => (brands ?? []).filter((b) => b.active && b.name.toLowerCase().includes(q.toLowerCase())), [brands, q]);
  const fromTaggers = useMemo(() => (brands ?? []).filter((b) => b.source === "tagger"), [brands]);

  async function post(body: unknown) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/admin/brands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed.");
      setMessage({ tone: "ok", text: `Saved ${j.upserted} brand${j.upserted === 1 ? "" : "s"}${j.rejected?.length ? ` · skipped ${j.rejected.length}: ${j.rejected.slice(0, 5).join(", ")}` : ""}.` });
      await load();
    } catch (e) { setMessage({ tone: "error", text: e instanceof Error ? e.message : "Failed." }); } finally { setBusy(false); }
  }
  const setTierOf = (b: Brand, t: string) => post({ brands: [{ name: b.name, tier: t, active: b.active }] });

  // Quick-pick buttons on the tag form: chosen and ordered here, 20 at most.
  const quick = useMemo(() => (brands ?? []).filter((b) => b.active && b.quick_pick_order != null).sort((a, b) => (a.quick_pick_order ?? 0) - (b.quick_pick_order ?? 0)), [brands]);
  const [quickAdd, setQuickAdd] = useState("");
  async function saveQuick(names: string[]) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/admin/brands", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ quick_pick: names }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed.");
      setMessage({ tone: "ok", text: `Quick-pick list saved: ${j.quick_pick.length} brand${j.quick_pick.length === 1 ? "" : "s"}.` });
      await load();
    } catch (e) { setMessage({ tone: "error", text: e instanceof Error ? e.message : "Failed." }); } finally { setBusy(false); }
  }
  const quickNames = quick.map((b) => b.name);
  const move = (i: number, d: -1 | 1) => { const n = [...quickNames]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; void saveQuick(n); };
  const addQuick = () => { const name = quickAdd.trim(); if (!name || quickNames.some((q) => q.toLowerCase() === name.toLowerCase())) return; if (quickNames.length >= 20) { setMessage({ tone: "error", text: "Twenty is the most the form shows — remove one first." }); return; } void saveQuick([...quickNames, name]); setQuickAdd(""); };
  const deactivate = (b: Brand) => window.confirm(`Remove ${b.name} from the list? Garments already tagged keep the name.`) && post({ brands: [{ name: b.name, tier: b.tier, active: false }] });

  if (!brands) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brands</h1>
        <p className="text-sm text-muted-foreground">Tier is resolved from this list, never judged by the tagger. Misspellings snap to the listed name; a brand nobody has listed is added here as High street when the garment is saved, marked <em>new from tagger</em>, for you to tier.</p>
      </div>
      {message && <p className={cn("rounded-md border p-3 text-sm", message.tone === "ok" ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "border-red-600 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300")}>{message.text}</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick-pick buttons on the tag form <span className="font-normal text-muted-foreground">· {quick.length} of 20</span></CardTitle>
          <p className="text-xs text-muted-foreground">The first ten show under Brand; the next ten appear under <em>More brands…</em>. Order here is the button order. With none chosen, the form shows the most-tagged brands of the last 90 days.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="flex flex-wrap gap-2">
            {quick.map((b, i) => (
              <li key={b.id} className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-sm", i >= 10 && "border-dashed text-muted-foreground")}>
                <span className="mr-1 text-xs tabular-nums text-muted-foreground">{i + 1}</span>{b.name}
                <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="rounded px-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30" title="Move earlier">‹</button>
                <button type="button" disabled={busy || i === quick.length - 1} onClick={() => move(i, 1)} className="rounded px-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30" title="Move later">›</button>
                <button type="button" disabled={busy} onClick={() => saveQuick(quickNames.filter((n) => n !== b.name))} className="rounded px-1 text-xs text-muted-foreground hover:bg-muted" title="Remove from quick picks">×</button>
              </li>
            ))}
            {quick.length === 0 && <li className="text-sm text-muted-foreground">None chosen yet.</li>}
          </ol>
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); addQuick(); }}>
            <Input list="quick-brands" value={quickAdd} onChange={(e) => setQuickAdd(e.target.value)} placeholder="Add a brand from the list…" className="h-9 w-64" autoComplete="off" />
            <datalist id="quick-brands">{(brands ?? []).filter((b) => b.active && b.quick_pick_order == null).map((b) => <option key={b.id} value={b.name} />)}</datalist>
            <Button type="submit" size="sm" disabled={busy || !quickAdd.trim() || !(brands ?? []).some((b) => b.active && b.name.toLowerCase() === quickAdd.trim().toLowerCase())}>Add to quick picks</Button>
          </form>
        </CardContent>
      </Card>

      {fromTaggers.length > 0 && (
        <Card className="border-amber-500">
          <CardHeader className="pb-2"><CardTitle className="text-base">New from taggers · {fromTaggers.length} to tier</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {fromTaggers.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                <span className="font-medium">{b.name}</span>
                <span className="text-xs text-muted-foreground">{b.added_by ?? "—"} · {new Date(b.added_at).toLocaleDateString("en-PK")}</span>
                <select value={b.tier} disabled={busy} onChange={(e) => post({ brands: [{ name: b.name, tier: e.target.value, active: true }] })} className="h-7 rounded-md border border-input bg-transparent px-1 text-xs">
                  {TIERS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter brands…" className="h-10 w-64" />
        <span className="text-xs text-muted-foreground">{shown.length} of {brands.filter((b) => b.active).length} brands</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {TIERS.map((t) => {
          const list = shown.filter((b) => b.tier === t.code).sort((a, b) => a.name.localeCompare(b.name));
          return (
            <Card key={t.code}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t.label} <span className="font-normal text-muted-foreground">· {t.mult} · {list.length}</span></CardTitle>
                <p className="text-xs text-muted-foreground">{t.note}</p>
              </CardHeader>
              <CardContent>
                <ul className="max-h-[60vh] divide-y overflow-auto text-sm">
                  {list.length === 0 && <li className="py-3 text-center text-muted-foreground">None</li>}
                  {list.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span>{b.name}{b.source === "tagger" && <span className="ml-2 rounded border border-amber-500 px-1 text-[10px] uppercase text-amber-700 dark:text-amber-300">new</span>}</span>
                      <span className="flex items-center gap-1">
                        <select value={b.tier} disabled={busy} onChange={(e) => setTierOf(b, e.target.value)} className="h-7 rounded-md border border-input bg-transparent px-1 text-xs" title="Move to another tier">
                          {TIERS.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}
                        </select>
                        <button type="button" disabled={busy} onClick={() => deactivate(b)} className="rounded px-1 text-xs text-muted-foreground hover:bg-muted" title="Remove from list">×</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Add a brand</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5"><Label htmlFor="bn">Name</Label><Input id="bn" value={name} onChange={(e) => setName(e.target.value)} className="w-56" /></div>
          <div className="grid gap-1.5"><Label htmlFor="bt">Tier</Label><select id="bt" value={tier} onChange={(e) => setTier(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{TIERS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></div>
          <Button disabled={!name.trim() || busy} onClick={() => post({ brands: [{ name, tier }] }).then(() => setName(""))}>Add</Button>
        </CardContent>
      </Card>
    </div>
  );
}
