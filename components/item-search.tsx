"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";

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
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="KHZ-… or Zara or Jeans" autoFocus className="max-w-md" />
      {error && <p className="text-sm text-destructive">{error}</p>}
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
