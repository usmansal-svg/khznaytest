"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Row = {
  id: number;
  sku: string;
  brand: string;
  sub_category: string;
  grade: string;
  size_label: string | null;
  colour_tag: string | null;
  status: string;
  list_price: number | null;
  tagged_at: string;
};

const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good" };
const STATUS: Record<string, string> = { tagged: "Tagged", on_floor: "On floor", sold: "Sold", pulled: "Pulled", set_aside: "Set aside" };
const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

export function ItemSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j.staff?.role ?? null)).catch(() => {});
  }, []);
  const canExport = role === "manager" || role === "founder";
  const exportUrl = (format: "xlsx" | "csv") => `/api/export?what=items&format=${format}&from=${from}&to=${to}`;

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Search failed.");
        setRows(json.items);
        setError(null);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Search failed.");
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Items</h1>
        <p className="text-sm text-muted-foreground">Find by SKU, brand or sub-category. Reprint a lost tag.</p>
      </div>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          // Scanner guns type the SKU and press Enter: go straight to the garment.
          if (e.key === "Enter" && /^KHZ-|^DEMO-/i.test(q.trim())) window.location.assign(`/items/${q.trim().toUpperCase()}`);
        }}
        placeholder="Scan a tag, or type KHZ-…, Zara, Jeans"
        autoFocus
        autoCapitalize="characters"
        className="h-12 max-w-md text-base"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}

      {canExport && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6 text-sm">
            <div className="mr-2"><div className="font-medium">Export tagged items</div><div className="text-xs text-muted-foreground">Every field on the tag plus tagger, lot, outlet, shipment and received dates.</div></div>
            <label className="grid gap-1 text-xs text-muted-foreground">Tagged from<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">to<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-md border border-input bg-transparent px-2 text-sm text-foreground" /></label>
            <Button asChild className="h-10"><a href={exportUrl("xlsx")}><Download className="size-4" /> Excel</a></Button>
            <Button asChild variant="outline" className="h-10"><a href={exportUrl("csv")}><Download className="size-4" /> CSV</a></Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            {q.trim() ? "Results" : "Recently tagged"}
            {loading && <span className="text-xs font-normal text-muted-foreground">searching…</span>}
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
                    <th className="pb-2">SKU</th>
                    <th className="pb-2">Brand</th>
                    <th className="pb-2">Item</th>
                    <th className="pb-2">Grade</th>
                    <th className="pb-2">Size</th>
                    <th className="pb-2">Colour</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right">Price</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 font-mono text-xs"><a href={`/items/${r.sku}`} className="underline-offset-2 hover:underline">{r.sku}</a></td>
                      <td className="py-2">{r.brand || <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2">{r.sub_category}</td>
                      <td className="py-2">{GRADE[r.grade] ?? r.grade}</td>
                      <td className="py-2">{r.size_label ?? "—"}</td>
                      <td className="py-2">
                        {r.colour_tag ? (
                          <span className="flex items-center gap-1.5 capitalize">
                            <span className={cn("inline-block size-3 rounded-full", { red: "bg-red-500", blue: "bg-blue-500", green: "bg-green-500", yellow: "bg-yellow-400" }[r.colour_tag])} />
                            {r.colour_tag}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">not floored</span>
                        )}
                      </td>
                      <td className="py-2">{STATUS[r.status] ?? r.status}</td>
                      <td className="py-2 text-right tabular-nums">{r.list_price != null ? pkr(r.list_price) : "—"}</td>
                      <td className="py-2 text-right">
                        <Button asChild size="sm" variant="outline">
                          <a href={`/items/${r.sku}/print`} target="_blank" rel="noreferrer">
                            <Printer className="size-4" /> Tag
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
