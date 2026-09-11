"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * The photography station. Online garments arrive here tagged, with the
 * barcode on. Scan the tag (or tap a row), take the pictures on the garment
 * page, come back for the next one. Works for a dedicated photographer or
 * for a tagger doing a photo session — the list is the same.
 */

type Row = { sku: string; brand: string | null; size: string | null; grade: string; tagged_at: string; online_status: string | null; sub_category: string; photos: number };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };

export function PhotosPage() {
  const router = useRouter();
  const [data, setData] = useState<{ waiting: Row[]; done: Row[]; total_online: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/photos/queue").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); }).catch((e) => setError(e.message));
    scanRef.current?.focus();
  }, []);

  function open(sku: string) {
    const s = sku.trim().toUpperCase();
    if (!s) return;
    router.push(`/items/${encodeURIComponent(s)}#photos`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Photos</h1>
        <p className="text-sm text-muted-foreground">The photography station. Scan the tag on an online garment, take its pictures on the garment page, then the next one. Outlet garments never come here — their reference shot is taken at tagging.</p>
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); open(scan); }}>
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan or type a SKU — KHZ-…" className="h-12 pl-10 font-mono text-base" autoComplete="off" />
        </div>
        <Button type="submit" className="h-12"><Camera className="size-4" /> Open</Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Waiting for pictures <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal">{data.waiting.length}</span></CardTitle>
            </CardHeader>
            <CardContent>
              {data.waiting.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nothing waiting. Every online garment has its pictures.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">SKU</th><th className="pb-2">Garment</th><th className="pb-2">Brand</th><th className="pb-2">Size</th><th className="pb-2">Condition</th><th className="pb-2">Tagged</th><th className="pb-2"></th></tr></thead>
                    <tbody className="divide-y">
                      {data.waiting.map((r) => (
                        <tr key={r.sku} className="cursor-pointer hover:bg-muted/50" onClick={() => open(r.sku)}>
                          <td className="py-2 pr-3 font-mono text-xs">{r.sku}</td>
                          <td className="py-2 pr-3">{r.sub_category}</td>
                          <td className="py-2 pr-3">{r.brand ?? "—"}</td>
                          <td className="py-2 pr-3">{r.size ?? "—"}</td>
                          <td className="py-2 pr-3">{GRADE[r.grade] ?? r.grade}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{new Date(r.tagged_at).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</td>
                          <td className="py-2 text-right"><Link href={`/items/${encodeURIComponent(r.sku)}#photos`} className="text-xs underline" onClick={(e) => e.stopPropagation()}>Take pictures</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {data.done.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Recently photographed</CardTitle></CardHeader>
              <CardContent>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {data.done.map((r) => (
                    <li key={r.sku} className="flex justify-between gap-2">
                      <Link href={`/items/${encodeURIComponent(r.sku)}`} className="font-mono text-xs underline">{r.sku}</Link>
                      <span className="truncate text-muted-foreground">{r.sub_category} · {r.brand ?? "—"} · {r.photos} photo{r.photos === 1 ? "" : "s"}{r.online_status ? ` · ${r.online_status}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
