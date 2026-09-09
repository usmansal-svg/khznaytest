"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { TagFaces, tagCss, type TagItem } from "@/components/tag-faces";

/** /print?skus=A,B,C — every tag from a session in one print job. */
export function PrintBatch() {
  const params = useSearchParams();
  const skus = (params.get("skus") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const [items, setItems] = useState<TagItem[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    Promise.all(skus.map((sku) => fetch(`/api/items/${encodeURIComponent(sku)}`).then((r) => r.json()).then((j) => (j.item ? j.item : null))))
      .then((res) => { setItems(res.filter(Boolean)); setFailed(skus.filter((_, i) => !res[i])); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (!skus.length) return <p className="p-6 text-neutral-500">No SKUs given.</p>;
  if (!items) return <p className="p-6 text-neutral-500">Loading {skus.length} tags…</p>;
  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white">
      <style>{tagCss()}</style>
      <div className="no-print flex items-center gap-3 p-4 text-sm">
        <button onClick={() => window.print()} className="rounded-md bg-black px-4 py-2 font-semibold text-white">Print {items.length} tags</button>
        <span className="text-neutral-600">{items.length * 2} pages · 50 × 90 mm</span>
        {failed.length > 0 && <span className="text-red-700">Not found: {failed.join(", ")}</span>}
      </div>
      <div className="flex flex-wrap gap-6 p-4 print:gap-0 print:p-0">{items.map((it) => <TagFaces key={it.sku} item={it} />)}</div>
    </div>
  );
}
