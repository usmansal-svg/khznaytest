"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Globe, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { HeaderFilter } from "@/components/header-filter";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Every tagged garment: search, Excel-style filters on every column, a tick
 * box per row with Select all, and export of exactly what is ticked. The
 * Station column says where the garment is right now (tagging, photography,
 * packing, online shelf, in transit, at an outlet, sold …).
 */

type Row = { id: number; sku: string; brand: string; sub_category: string; category: string; gender: string; lot: string | null; grade: string; size_label: string | null; station: string; outlet: string | null; tagged_by: string | null; season: string | null; wearer: string | null; rare: boolean; list_price: number | null; tagged_at: string; channel: string; shopify: string | null; shopify_error: string | null };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
type Key = "lot" | "brand" | "sub_category" | "grade" | "size_label" | "station" | "channel" | "tagged_by" | "shopify";
const COLS: { key: Key; label: string; format?: (v: string) => string }[] = [
  { key: "lot", label: "Lot" }, { key: "brand", label: "Brand" }, { key: "sub_category", label: "Item" }, { key: "grade", label: "Grade", format: (g) => GRADE[g] ?? g },
  { key: "size_label", label: "Size" }, { key: "station", label: "Station" }, { key: "channel", label: "Channel", format: (c) => (c === "online" ? "Online store" : "Outlet") }, { key: "tagged_by", label: "Tagger" },
  { key: "shopify", label: "Shopify", format: (v) => SHOPIFY_LABEL[v] ?? v },
];
const SHOPIFY_LABEL: Record<string, string> = { "—": "Not on Shopify", pos: "POS only", online: "Website only", both: "Website + POS", draft: "Draft (hidden)" };
const empty = (): Record<Key, Set<string>> => ({ lot: new Set(), brand: new Set(), sub_category: new Set(), grade: new Set(), size_label: new Set(), station: new Set(), channel: new Set(), tagged_by: new Set(), shopify: new Set() });
const valueOf = (r: Row, k: Key) => String(r[k] ?? "—");

export function ItemSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<Key, Set<string>>>(empty());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [exportSkus, setExportSkus] = useState("");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv">("xlsx");
  const [visibility, setVisibility] = useState<"pos" | "both" | "online" | "draft">("pos");
  const [pushing, setPushing] = useState<{ total: number; done: number; failed: { sku: string; error: string }[] } | null>(null);

  // Put the ticked garments on Shopify with the chosen visibility, a batch at a time.
  async function pushTicked() {
    const skus = pickedVisible.map((r) => r.sku);
    if (!skus.length) return;
    const label = { pos: "the outlets' Shopify POS only (not on the website)", both: "the website and the Shopify POS", online: "the website only", draft: "Shopify as hidden drafts" }[visibility];
    if (!window.confirm(`Put ${skus.length} garment${skus.length === 1 ? "" : "s"} on ${label}?`)) return;
    setPushing({ total: skus.length, done: 0, failed: [] });
    for (let i = 0; i < skus.length; i += 25) {
      const batch = skus.slice(i, i + 25);
      try {
        const res = await fetch("/api/shopify/push-bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ skus: batch, visibility }) });
        const j = await res.json();
        if (!res.ok) { setPushing((p) => p && { ...p, failed: [...p.failed, ...batch.map((sku) => ({ sku, error: j.error ?? "failed" }))], done: p.done + batch.length }); continue; }
        setPushing((p) => p && { ...p, done: p.done + batch.length, failed: [...p.failed, ...(j.results as { ok: boolean; sku: string; error?: string }[]).filter((r) => !r.ok).map((r) => ({ sku: r.sku, error: r.error ?? "failed" }))] });
      } catch (e) { setPushing((p) => p && { ...p, done: p.done + batch.length, failed: [...p.failed, ...batch.map((sku) => ({ sku, error: e instanceof Error ? e.message : "failed" }))] }); }
    }
    const res = await fetch(`/api/items?q=${encodeURIComponent(q.trim())}`); const json = await res.json(); if (res.ok) setRows(json.items);
  }

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setFrom(today.slice(0, 8) + "01"); setTo(today);
    fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j.staff?.role ?? null)).catch(() => {});
  }, []);
  const canExport = role === "manager" || role === "founder";

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Search failed.");
        setRows(json.items); setError(null);
      } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Search failed."); } finally { setLoading(false); }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  // Filters combine; each list offers only the values still reachable under the others, as Excel does.
  const pass = (r: Row, skip?: Key) => COLS.every((c) => c.key === skip || !filters[c.key].size || filters[c.key].has(valueOf(r, c.key)));
  const visible = useMemo(() => rows.filter((r) => pass(r)), [rows, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const valuesFor = (k: Key) => [...new Set(rows.filter((r) => pass(r, k)).map((r) => valueOf(r, k)))].sort();
  const filtering = COLS.some((c) => filters[c.key].size > 0);
  const allVisiblePicked = visible.length > 0 && visible.every((r) => picked.has(r.sku));
  const pickedVisible = visible.filter((r) => picked.has(r.sku));
  const toggleAll = () => setPicked((p) => { const n = new Set(p); if (allVisiblePicked) visible.forEach((r) => n.delete(r.sku)); else visible.forEach((r) => n.add(r.sku)); return n; });

  function exportList(skus: string[], format: "xlsx" | "csv") {
    if (!skus.length) return;
    setExportSkus(skus.join(",")); setExportFormat(format);
    setTimeout(() => formRef.current?.submit(), 0);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Items</h1>
        <p className="text-sm text-muted-foreground">Every tagged garment. Filter any column the way you would in Excel, tick the ones you want, and export exactly those.</p>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU, brand or garment type…" className="h-12 text-base" autoFocus />
      {error && <p className="text-sm text-destructive">{error}</p>}

      {canExport && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-4">
            <form ref={formRef} method="post" action="/api/export" className="hidden"><input type="hidden" name="what" value="items" /><input type="hidden" name="format" value={exportFormat} /><input type="hidden" name="skus" value={exportSkus} /></form>
            <div className="mr-2"><div className="font-medium">Export</div><div className="text-xs text-muted-foreground">Every field on the tag plus station, tagger, lot, outlet, shipment and received dates.</div></div>
            <Button className="h-10" disabled={!pickedVisible.length} onClick={() => exportList(pickedVisible.map((r) => r.sku), "xlsx")}><Download className="size-4" /> Export {pickedVisible.length || ""} ticked · Excel</Button>
            <Button variant="outline" className="h-10" disabled={!pickedVisible.length} onClick={() => exportList(pickedVisible.map((r) => r.sku), "csv")}>CSV</Button>
            <Button variant="outline" className="h-10" disabled={!visible.length} onClick={() => exportList(visible.map((r) => r.sku), "xlsx")}>Export all {visible.length} shown</Button>
            <span className="mx-2 text-muted-foreground">or by date</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-40" /><span className="text-muted-foreground">to</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-40" />
            <Button asChild variant="outline" className="h-10"><a href={`/api/export?what=items&format=xlsx&from=${from}&to=${to}`}><Download className="size-4" /> Excel</a></Button>
          </CardContent>
        </Card>
      )}

      {canExport && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-4">
            <div className="mr-2"><div className="font-medium">Shopify</div><div className="text-xs text-muted-foreground">Tick garments, choose where they should appear, and upload. POS only makes them sellable on the outlets&apos; Shopify POS without showing on the website.</div></div>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="h-10 rounded-md border border-input bg-transparent px-2 text-sm">
              <option value="pos">Outlets&apos; Shopify POS only</option>
              <option value="both">Website + Shopify POS</option>
              <option value="online">Website only</option>
              <option value="draft">Draft (hidden everywhere)</option>
            </select>
            <Button className="h-10" disabled={!pickedVisible.length || pushing != null && pushing.done < pushing.total} onClick={pushTicked}><Globe className="size-4" /> Upload {pickedVisible.length || ""} ticked to Shopify</Button>
            {pushing && (
              <span className="text-sm">
                {pushing.done < pushing.total ? `Uploading ${pushing.done} of ${pushing.total}…` : <span className="text-green-700 dark:text-green-400">Done: {pushing.total - pushing.failed.length} uploaded{pushing.failed.length ? `, ${pushing.failed.length} failed` : ""}.</span>}
                {pushing.failed.length > 0 && <span className="block text-xs text-destructive">{pushing.failed.slice(0, 5).map((f) => `${f.sku}: ${f.error}`).join(" · ")}{pushing.failed.length > 5 ? " …" : ""}</span>}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>{q.trim() ? "Results" : "Recently tagged"} <span className="font-normal text-muted-foreground">· {visible.length}{filtering ? ` of ${rows.length}` : ""}{picked.size ? ` · ${pickedVisible.length} ticked` : ""}</span>{loading && <span className="ml-2 text-xs font-normal text-muted-foreground">searching…</span>}</span>
            <span className="flex gap-3 text-xs font-normal">
              {filtering && <button type="button" className="underline" onClick={() => setFilters(empty())}>Clear filters</button>}
              {picked.size > 0 && <button type="button" className="underline" onClick={() => setPicked(new Set())}>Untick all</button>}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{q.trim() ? "Nothing matches." : "No items tagged yet."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-2"><Checkbox checked={allVisiblePicked} onCheckedChange={toggleAll} aria-label="Select all shown" /></th>
                    <th className="pb-2 pr-2">SKU</th>
                    {COLS.map((c) => <th key={c.key} className="pb-2 pr-2"><HeaderFilter label={c.label} values={valuesFor(c.key)} selected={filters[c.key]} onChange={(v) => setFilters((f) => ({ ...f, [c.key]: v }))} format={c.format} /></th>)}
                    <th className="pb-2 text-right">Price</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map((r) => (
                    <tr key={r.id} className={cn(picked.has(r.sku) && "bg-muted/40")}>
                      <td className="py-2 pr-2"><Checkbox checked={picked.has(r.sku)} onCheckedChange={(v) => setPicked((p) => { const n = new Set(p); if (v === true) n.add(r.sku); else n.delete(r.sku); return n; })} aria-label={`Select ${r.sku}`} /></td>
                      <td className="py-2 pr-2 font-mono text-xs"><a href={`/items/${r.sku}`} className="underline-offset-2 hover:underline">{r.sku}</a>{r.rare ? " ★" : ""}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{r.lot ?? "—"}</td>
                      <td className="py-2 pr-2">{r.brand || <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 pr-2">{r.sub_category}</td>
                      <td className="py-2 pr-2">{GRADE[r.grade] ?? r.grade}</td>
                      <td className="py-2 pr-2">{r.size_label ?? "—"}</td>
                      <td className="py-2 pr-2"><span className={cn("rounded-full border px-2 py-0.5 text-xs", /^At |Online shelf|^Sold$/.test(r.station) ? "border-green-600 text-green-700 dark:text-green-400" : /transit|packed|Packing/.test(r.station) ? "border-sky-500 text-sky-700 dark:text-sky-300" : /QC|Set aside|Pulled|damaged|Rejected|Unlisted/.test(r.station) ? "border-amber-500 text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{r.station}</span></td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">{r.channel === "online" ? "Online store" : "Outlet"}</td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">{r.tagged_by ?? "—"}</td>
                      <td className="py-2 pr-2 text-xs">{r.shopify ? <span className={cn("rounded-full border px-2 py-0.5", r.shopify_error ? "border-red-400 text-red-700 dark:text-red-300" : r.shopify === "draft" ? "text-muted-foreground" : "border-sky-500 text-sky-700 dark:text-sky-300")} title={r.shopify_error ?? undefined}>{SHOPIFY_LABEL[r.shopify] ?? r.shopify}{r.shopify_error ? " ⚠" : ""}</span> : <span className="text-muted-foreground">—</span>}{r.shopify_error && <div className="mt-0.5 max-w-[16rem] text-[10px] leading-tight text-red-700 dark:text-red-300">{r.shopify_error.slice(0, 140)}</div>}</td>
                      <td className="py-2 text-right tabular-nums">{r.list_price != null ? pkr(r.list_price) : "—"}</td>
                      <td className="py-2 text-right"><Button asChild size="sm" variant="outline"><a href={`/items/${r.sku}/print`} target="_blank" rel="noreferrer"><Printer className="size-4" /> Tag</a></Button></td>
                    </tr>
                  ))}
                  {visible.length === 0 && <tr><td colSpan={13} className="py-6 text-center text-muted-foreground">Nothing matches these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
