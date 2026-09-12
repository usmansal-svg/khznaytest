"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Printer } from "lucide-react";

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
type Key = "lot" | "brand" | "sub_category" | "grade" | "size_label" | "station" | "channel" | "shopify";
const COLS: { key: Key; label: string; format?: (v: string) => string }[] = [
  { key: "lot", label: "Lot" }, { key: "brand", label: "Brand" }, { key: "sub_category", label: "Item" }, { key: "grade", label: "Grade", format: (g) => GRADE[g] ?? g },
  { key: "size_label", label: "Size" }, { key: "station", label: "Station" }, { key: "channel", label: "Channel", format: (c) => (c === "online" ? "Online store" : "Outlet") },
  { key: "shopify", label: "Shopify", format: (v) => SHOPIFY_LABEL[v] ?? v },
];
const SHOPIFY_LABEL: Record<string, string> = { "—": "Not on Shopify", pos: "POS only", online: "Website only", both: "Website + POS", draft: "Draft (hidden)" };
const empty = (): Record<Key, Set<string>> => ({ lot: new Set(), brand: new Set(), sub_category: new Set(), grade: new Set(), size_label: new Set(), station: new Set(), channel: new Set(), shopify: new Set() });
const valueOf = (r: Row, k: Key) => String(r[k] ?? "—");
const listUrl = (q: string, from: string, to: string) => `/api/items?q=${encodeURIComponent(q.trim())}&from=${from}&to=${to}`;

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
  const [total, setTotal] = useState(0);
  const [cap, setCap] = useState(5000);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const formRef = useRef<HTMLFormElement>(null);
  const [exportSkus, setExportSkus] = useState("");
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
    const res = await fetch(listUrl(q, from, to)); const json = await res.json(); if (res.ok) { setRows(json.items); setTotal(json.total); }
  }

  useEffect(() => {
    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    setFrom(today.slice(0, 8) + "01"); setTo(today);
    try { const n = Number(localStorage.getItem("khz_items_page_size")); if ([50, 100, 200].includes(n)) setPageSize(n); } catch { /* fine */ }
    fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j.staff?.role ?? null)).catch(() => {});
  }, []);
  const canExport = role === "manager" || role === "founder";

  useEffect(() => {
    if (!from || !to) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(listUrl(q, from, to), { signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Search failed.");
        setRows(json.items); setTotal(json.total ?? json.items.length); setCap(json.cap ?? 5000); setError(null); setPage(1);
      } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Search failed."); } finally { setLoading(false); }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, from, to]);

  // Filters combine; each list offers only the values still reachable under the others, as Excel does.
  const pass = (r: Row, skip?: Key) => COLS.every((c) => c.key === skip || !filters[c.key].size || filters[c.key].has(valueOf(r, c.key)));
  const visible = useMemo(() => rows.filter((r) => pass(r)), [rows, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const valuesFor = (k: Key) => [...new Set(rows.filter((r) => pass(r, k)).map((r) => valueOf(r, k)))].sort();
  const filtering = COLS.some((c) => filters[c.key].size > 0);
  const allVisiblePicked = visible.length > 0 && visible.every((r) => picked.has(r.sku));
  const pickedVisible = visible.filter((r) => picked.has(r.sku));
  const toggleAll = () => setPicked((p) => { const n = new Set(p); if (allVisiblePicked) visible.forEach((r) => n.delete(r.sku)); else visible.forEach((r) => n.add(r.sku)); return n; });
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = visible.slice((safePage - 1) * pageSize, safePage * pageSize);
  const changePageSize = (n: number) => { setPageSize(n); setPage(1); try { localStorage.setItem("khz_items_page_size", String(n)); } catch { /* fine */ } };
  const pager = (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{visible.length ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, visible.length)} of ${visible.length.toLocaleString("en-PK")}` : "0"}{filtering ? ` (filtered from ${rows.length.toLocaleString("en-PK")})` : ""}</span>
      <span className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">Per page
          <select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))} className="h-8 rounded-md border border-input bg-transparent px-1 text-sm text-foreground">{[50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft className="size-4" /></Button>
        <span className="tabular-nums">Page {safePage} of {pageCount}</span>
        <Button size="sm" variant="outline" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}><ChevronRight className="size-4" /></Button>
      </span>
    </div>
  );

  function exportList(skus: string[]) {
    if (!skus.length) return;
    setExportSkus(skus.join(","));
    setTimeout(() => formRef.current?.submit(), 0);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Items</h1>
        <p className="text-sm text-muted-foreground">Every tagged garment. Filter any column the way you would in Excel, tick the ones you want, and export exactly those.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU, brand or garment type (all time)…" className="h-12 min-w-[16rem] flex-1 text-base" autoFocus />
        <div className={cn("flex items-center overflow-hidden rounded-md border border-input", q.trim() && "opacity-50")} title={q.trim() ? "A search looks across all dates" : "Tagged between these dates"}>
          <span className="pl-3 text-sm text-muted-foreground">Tagged</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 w-[9.5rem] rounded-none border-0 shadow-none focus-visible:ring-0" aria-label="From" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-12 w-[9.5rem] rounded-none border-0 shadow-none focus-visible:ring-0" aria-label="To" />
        </div>
      </div>
      {total > cap && !q.trim() && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{total.toLocaleString("en-PK")} garments were tagged in this window; the list shows the latest {cap.toLocaleString("en-PK")}. Narrow the dates to see the rest here. The Excel export of a date range always includes every garment.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {canExport && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <form ref={formRef} method="post" action="/api/export" className="hidden"><input type="hidden" name="what" value="items" /><input type="hidden" name="format" value="xlsx" /><input type="hidden" name="skus" value={exportSkus} /></form>
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"><FileSpreadsheet className="size-5" /></span>
                <div><div className="font-semibold">Export to Excel</div><div className="text-xs text-muted-foreground">Every field on the tag plus station, tagger, lot, outlet, shipment and received dates.</div></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button className="h-10" disabled={!pickedVisible.length} onClick={() => exportList(pickedVisible.map((r) => r.sku))}><Download className="size-4" /> Export {pickedVisible.length || ""} ticked</Button>
                <Button variant="outline" className="h-10" disabled={!visible.length} onClick={() => exportList(visible.map((r) => r.sku))}>Export all {visible.length} shown</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" className="h-10"><a href={`/api/export?what=items&format=xlsx&from=${from}&to=${to}`}><Download className="size-4" /> Export every garment tagged {from} → {to}</a></Button>
                <span className="text-xs text-muted-foreground">Straight from the database — {total.toLocaleString("en-PK")} garment{total === 1 ? "" : "s"}, whatever the list shows.</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#95BF47]/60 bg-gradient-to-br from-[#95BF47]/10 via-transparent to-transparent">
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#95BF47]/20"><ShopifyMark className="size-6" /></span>
                <div><div className="font-semibold">Upload to Shopify</div><div className="text-xs text-muted-foreground">Tick garments, choose where they should appear, and upload. POS only makes them sellable on the outlets&apos; Shopify POS without showing on the website.</div></div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div role="radiogroup" aria-label="Where to show" className="inline-flex overflow-hidden rounded-md border border-input bg-background p-0.5">
                  {([["pos", "POS only"], ["both", "Website + POS"], ["online", "Website only"], ["draft", "Draft"]] as const).map(([v, label]) => (
                    <button key={v} type="button" role="radio" aria-checked={visibility === v} onClick={() => setVisibility(v)} className={cn("h-9 rounded px-3 text-sm transition-colors", visibility === v ? "bg-[#5E8E3E] font-semibold text-white shadow-sm" : "text-muted-foreground hover:bg-muted")}>{label}</button>
                  ))}
                </div>
                <button type="button" disabled={!pickedVisible.length || (pushing != null && pushing.done < pushing.total)} onClick={pushTicked}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-[#5E8E3E] px-4 text-sm font-semibold text-white shadow-md transition hover:bg-[#4f7a33] hover:shadow-lg active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
                  <ShopifyMark className="size-4" light /> Upload {pickedVisible.length || ""} ticked
                </button>
              </div>
              {pushing && (
                <p className="text-sm">
                  {pushing.done < pushing.total ? `Uploading ${pushing.done} of ${pushing.total}…` : <span className="text-green-700 dark:text-green-400">Done: {pushing.total - pushing.failed.length} uploaded{pushing.failed.length ? `, ${pushing.failed.length} failed` : ""}.</span>}
                  {pushing.failed.length > 0 && <span className="block text-xs text-destructive">{pushing.failed.slice(0, 5).map((f) => `${f.sku}: ${f.error}`).join(" · ")}{pushing.failed.length > 5 ? " …" : ""}</span>}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>{q.trim() ? "Results" : "Tagged in this window"} <span className="font-normal text-muted-foreground">· {visible.length.toLocaleString("en-PK")}{filtering ? ` of ${rows.length.toLocaleString("en-PK")}` : ""}{picked.size ? ` · ${pickedVisible.length} ticked` : ""}</span>{loading && <span className="ml-2 text-xs font-normal text-muted-foreground">searching…</span>}</span>
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
            <div className="space-y-3">
            {pager}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-2"><Checkbox checked={allVisiblePicked} onCheckedChange={toggleAll} aria-label="Select all shown" /></th>
                    <th className="pb-2 pr-2">SKU</th>
                    {COLS.map((c) => <th key={c.key} className="whitespace-nowrap pb-2 pr-2"><HeaderFilter label={c.label} values={valuesFor(c.key)} selected={filters[c.key]} onChange={(v) => setFilters((f) => ({ ...f, [c.key]: v }))} format={c.format} /></th>)}
                    <th className="pb-2 text-right">Price</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pageRows.map((r) => (
                    <tr key={r.id} className={cn(picked.has(r.sku) && "bg-muted/40")}>
                      <td className="py-2 pr-2"><Checkbox checked={picked.has(r.sku)} onCheckedChange={(v) => setPicked((p) => { const n = new Set(p); if (v === true) n.add(r.sku); else n.delete(r.sku); return n; })} aria-label={`Select ${r.sku}`} /></td>
                      <td className="whitespace-nowrap py-2 pr-2 font-mono text-xs"><a href={`/items/${r.sku}`} className="underline-offset-2 hover:underline">{r.sku}</a>{r.rare ? " ★" : ""}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{r.lot ?? "—"}</td>
                      <td className="py-2 pr-2">{r.brand || <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 pr-2">{r.sub_category}</td>
                      <td className="py-2 pr-2">{GRADE[r.grade] ?? r.grade}</td>
                      <td className="py-2 pr-2">{r.size_label ?? "—"}</td>
                      <td className="whitespace-nowrap py-2 pr-2"><span className={cn("inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs", /^On floor|Online shelf|^Sold$/.test(r.station) ? "border-green-600 text-green-700 dark:text-green-400" : /^Missing/.test(r.station) ? "border-red-500 text-red-700 dark:text-red-300" : /transit|Packing|Receiving|Stockroom/.test(r.station) ? "border-sky-500 text-sky-700 dark:text-sky-300" : /QC|Set aside|Pulled|damaged|Rejected|Unlisted/.test(r.station) ? "border-amber-500 text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{r.station}</span></td>
                      <td className="whitespace-nowrap py-2 pr-2 text-xs text-muted-foreground">{r.channel === "online" ? "Online store" : "Outlet"}</td>
                      <td className="py-2 pr-2 text-xs">{r.shopify ? <span className={cn("inline-block whitespace-nowrap rounded-full border px-2 py-0.5", r.shopify_error ? "border-red-400 text-red-700 dark:text-red-300" : r.shopify === "draft" ? "text-muted-foreground" : "border-sky-500 text-sky-700 dark:text-sky-300")} title={r.shopify_error ?? undefined}>{SHOPIFY_LABEL[r.shopify] ?? r.shopify}{r.shopify_error ? " ⚠" : ""}</span> : <span className="text-muted-foreground">—</span>}{r.shopify_error && <div className="mt-0.5 max-w-[16rem] text-[10px] leading-tight text-red-700 dark:text-red-300">{r.shopify_error.slice(0, 140)}</div>}</td>
                      <td className="py-2 text-right tabular-nums">{r.list_price != null ? pkr(r.list_price) : "—"}</td>
                      <td className="py-2 text-right"><Button asChild size="sm" variant="outline"><a href={`/items/${r.sku}/print`} target="_blank" rel="noreferrer"><Printer className="size-4" /> Tag</a></Button></td>
                    </tr>
                  ))}
                  {visible.length === 0 && <tr><td colSpan={12} className="py-6 text-center text-muted-foreground">Nothing matches these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            {pager}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** The Shopify bag, drawn simply: green bag with a white "S" for the badge, all white on the green button. */
function ShopifyMark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8.2 6.4 9.6 3.9c.5-.9 1.4-1.4 2.4-1.4s1.9.5 2.4 1.4l1.4 2.5h2.1c.5 0 .9.4.9.9l1 12.6c0 .9-.6 1.6-1.5 1.7L12 23l-6.3-1.4c-.9-.2-1.5-.9-1.5-1.7l1-12.6c0-.5.4-.9.9-.9h2.1Zm2.3 0h3l-.9-1.6a.7.7 0 0 0-1.2 0l-.9 1.6Z" fill={light ? "#fff" : "#5E8E3E"} />
      <path d="M13.9 10.6c-.5-.3-1.2-.5-1.8-.5-.9 0-1.4.5-1.4 1 0 .6.6.9 1.5 1.3 1.1.5 2.1 1.1 2.1 2.5 0 1.6-1.2 2.6-3 2.6-1 0-2-.4-2.6-.9l.6-1.5c.5.4 1.3.8 1.9.8.6 0 1-.3 1-.8 0-.5-.4-.8-1.3-1.2-1.1-.5-2.2-1.1-2.2-2.6 0-1.5 1.1-2.7 3.1-2.7.9 0 1.7.3 2.3.6l-.2 1.4Z" fill={light ? "#5E8E3E" : "#fff"} />
    </svg>
  );
}
