"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Row = { id: number; brand_id: number | null; brand: string | null; tier: string | null; sub_category_slug: string | null; sub_category: string | null; category_slug: string | null; category: string | null; gender: string | null; new_price_pkr: number; source: string; confirmed: boolean; note: string | null; updated_at: string; by: string | null };
type Need = { brand_id: number; brand: string; sub_category_slug: string; sub_category: string; category: string; gender: string; n: number };
type Brand = { id: number; name: string; tier: string };
type Sub = { slug: string; name: string; gender: string; category_slug: string };
type Cat = { slug: string; name: string; gender: string };

const TIER_LABEL: Record<string, string> = { regular: "High street", affordable_luxury: "Affordable luxury", ultra_luxury: "Ultra luxury" };
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/**
 * The "New in store" reference prices printed on tags. Most specific row
 * wins at tagging: brand × sub-category, then brand × category, then tier
 * × sub-category, then tier × category. Below that the pricing sheet's
 * market price, then the formula in Pricing → Control.
 */
export function CompareAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [f, setF] = useState({ who: "brand" as "brand" | "tier", brand_id: "", tier: "regular", what: "sub" as "sub" | "cat", gender: "men", sub: "", cat: "", price: "", note: "" });

  async function load() {
    const j = await (await fetch("/api/admin/reference-prices")).json();
    if (j.error) return setMessage({ tone: "error", text: j.error });
    setRows(j.rows); setNeeds(j.needs);
  }
  useEffect(() => {
    void load();
    fetch("/api/admin/brands").then((r) => r.json()).then((j) => setBrands((j.brands ?? []).filter((b: { active: boolean }) => b.active)));
    fetch("/api/reference").then((r) => r.json()).then((j) => { setSubs(j.sub_categories ?? []); setCats(j.categories ?? []); });
  }, []);

  const subsFor = useMemo(() => subs.filter((s) => s.gender === f.gender).sort((a, b) => a.name.localeCompare(b.name)), [subs, f.gender]);
  const catsFor = useMemo(() => cats.filter((c) => c.gender === f.gender), [cats, f.gender]);
  useEffect(() => { if (subsFor.length && !subsFor.some((s) => s.slug === f.sub)) setF((x) => ({ ...x, sub: subsFor[0].slug })); }, [subsFor, f.sub]);
  useEffect(() => { if (catsFor.length && !catsFor.some((c) => c.slug === f.cat)) setF((x) => ({ ...x, cat: catsFor[0].slug })); }, [catsFor, f.cat]);

  async function save(body: unknown, ok: string) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/admin/reference-prices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMessage({ tone: "ok", text: ok });
      await load();
    } catch (e) { setMessage({ tone: "error", text: e instanceof Error ? e.message : "Failed." }); } finally { setBusy(false); }
  }
  async function remove(r: Row) {
    if (!window.confirm("Remove this reference price?")) return;
    setBusy(true);
    await fetch("/api/admin/reference-prices", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id }) });
    await load(); setBusy(false);
  }

  if (!rows) return <p className="text-muted-foreground">Loading…</p>;
  const shown = rows.filter((r) => `${r.brand ?? TIER_LABEL[r.tier ?? ""]} ${r.sub_category ?? r.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compare prices</h1>
        <p className="text-sm text-muted-foreground">The &quot;New in store&quot; figure on the tag, and the saving. A brand × sub-category price is used first; broader rows fill the gaps; the pricing sheet&apos;s market price and then the formula come last. Everything prints rounded down, so the claim is always safe.</p>
      </div>
      {message && <p className={cn("rounded-md border p-3 text-sm", message.tone === "ok" ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "border-red-600 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300")}>{message.text}</p>}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Add or update a price</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2"><Button type="button" size="sm" variant={f.who === "brand" ? "default" : "outline"} onClick={() => setF({ ...f, who: "brand" })}>A brand</Button><Button type="button" size="sm" variant={f.who === "tier" ? "default" : "outline"} onClick={() => setF({ ...f, who: "tier" })}>A whole tier</Button></div>
              {f.who === "brand" ? (
                <div className="grid gap-1.5"><Label>Brand</Label><select value={f.brand_id} onChange={(e) => setF({ ...f, brand_id: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="">— choose —</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              ) : (
                <div className="grid gap-1.5"><Label>Tier</Label><select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5"><Label>Gender</Label><select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{["men", "women", "teenage", "kid", "toddler", "infant"].map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
                <div className="grid gap-1.5"><Label>Level</Label><div className="flex gap-1"><Button type="button" size="sm" variant={f.what === "sub" ? "default" : "outline"} onClick={() => setF({ ...f, what: "sub" })}>Sub-category</Button><Button type="button" size="sm" variant={f.what === "cat" ? "default" : "outline"} onClick={() => setF({ ...f, what: "cat" })}>Category</Button></div></div>
              </div>
              {f.what === "sub" ? (
                <div className="grid gap-1.5"><Label>Sub-category</Label><select value={f.sub} onChange={(e) => setF({ ...f, sub: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{subsFor.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}</select></div>
              ) : (
                <div className="grid gap-1.5"><Label>Category</Label><select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{catsFor.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></div>
              )}
              <div className="grid gap-1.5"><Label>New price · Rs</Label><Input type="number" step="100" min="100" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="8500" /></div>
              <div className="grid gap-1.5"><Label>Note</Label><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Nike.com Dri-FIT tee, £28" /></div>
              <Button className="w-full" disabled={busy || !Number(f.price) || (f.who === "brand" && !f.brand_id)} onClick={() => save({ brand_id: f.who === "brand" ? Number(f.brand_id) : null, tier: f.who === "tier" ? f.tier : null, sub_category_slug: f.what === "sub" ? f.sub : null, category_slug: f.what === "cat" ? f.cat : null, new_price_pkr: Math.round(Number(f.price)), source: "founder", confirmed: true, note: f.note }, "Saved.").then(() => setF((x) => ({ ...x, price: "", note: "" })))}>Save</Button>
            </CardContent>
          </Card>

          {needs.length > 0 && (
            <Card className="border-amber-500">
              <CardHeader className="pb-2"><CardTitle className="text-base">Needs a price · most tagged first</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">{needs.map((n) => (
                  <li key={`${n.brand_id}|${n.sub_category_slug}`} className="flex items-center justify-between gap-2 py-1.5">
                    <span><span className="font-medium">{n.brand}</span> · {n.sub_category} <span className="text-xs text-muted-foreground">({n.gender} · {n.category}) · {n.n} tagged</span></span>
                    <QuickPrice onSave={(price) => save({ brand_id: n.brand_id, sub_category_slug: n.sub_category_slug, new_price_pkr: price, source: "founder", confirmed: true }, `${n.brand} · ${n.sub_category} saved.`)} busy={busy} />
                  </li>
                ))}</ul>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-base"><span>Reference prices · {rows.length}</span><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="h-8 w-48" /></CardTitle></CardHeader>
          <CardContent>
            {shown.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No reference prices yet. Add one on the left, or work through the &quot;needs a price&quot; list.</p> : (
              <div className="max-h-[70vh] overflow-auto"><table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Who</th><th className="pb-2">What</th><th className="pb-2 text-right">New price</th><th className="pb-2">Source</th><th className="pb-2">Note</th><th className="pb-2">By</th><th className="pb-2"></th></tr></thead>
                <tbody className="divide-y">{shown.map((r) => (
                  <tr key={r.id} className={cn(!r.confirmed && "bg-amber-50/50 dark:bg-amber-950/20")}>
                    <td className="py-1.5 font-medium">{r.brand ?? <span className="text-muted-foreground">{TIER_LABEL[r.tier ?? ""]} (tier)</span>}</td>
                    <td className="py-1.5 capitalize">{r.gender} · {r.sub_category ?? <span className="text-muted-foreground">{r.category} (category)</span>}</td>
                    <td className="py-1.5 text-right tabular-nums">{rs(r.new_price_pkr)}</td>
                    <td className="py-1.5 text-xs">{r.source}{r.confirmed ? "" : " · estimate"}{!r.confirmed && <button className="ml-2 underline" disabled={busy} onClick={() => save({ brand_id: r.brand_id, tier: r.tier, sub_category_slug: r.sub_category_slug, category_slug: r.category_slug, new_price_pkr: r.new_price_pkr, source: r.source, confirmed: true, note: r.note }, "Confirmed.")}>confirm</button>}</td>
                    <td className="max-w-[16rem] truncate py-1.5 text-xs text-muted-foreground" title={r.note ?? ""}>{r.note ?? ""}</td>
                    <td className="py-1.5 text-xs text-muted-foreground">{r.by ?? "—"}</td>
                    <td className="py-1.5 text-right"><button className="rounded px-1 text-xs text-muted-foreground hover:bg-muted" disabled={busy} onClick={() => remove(r)}>×</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickPrice({ onSave, busy }: { onSave: (price: number) => void; busy: boolean }) {
  const [v, setV] = useState("");
  return (
    <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (Number(v) > 0) { onSave(Math.round(Number(v))); setV(""); } }}>
      <Input type="number" step="100" min="100" value={v} onChange={(e) => setV(e.target.value)} placeholder="Rs" className="h-8 w-24" />
      <Button type="submit" size="sm" variant="outline" disabled={busy || !Number(v)}>Save</Button>
    </form>
  );
}
