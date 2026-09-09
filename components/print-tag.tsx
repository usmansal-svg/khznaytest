"use client";

import { useEffect, useState } from "react";

import { TagFaces, tagCss, type TagItem } from "@/components/tag-faces";

/** One garment's tag, with a Print button; auto-prints with ?auto=1. */
export function PrintTag({ sku }: { sku: string }) {
  const [item, setItem] = useState<TagItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/items/${encodeURIComponent(sku)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Not found."); setItem(j.item); })
      .catch((e) => setError(e.message));
  }, [sku]);

  useEffect(() => {
    if (item && new URLSearchParams(window.location.search).get("auto") === "1") setTimeout(() => window.print(), 400);
  }, [item]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!item) return <p className="p-6 text-neutral-500">Loading tag…</p>;
  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white">
      <style>{tagCss()}</style>
      <div className="no-print flex items-center gap-3 p-4 text-sm">
        <button onClick={() => window.print()} className="rounded-md bg-black px-4 py-2 font-semibold text-white">Print tag</button>
        <span className="text-neutral-600">50 × 90 mm · front and back print as two pages</span>
        <a href={`/items/${item.sku}`} className="ml-auto text-neutral-600 underline">Garment</a>
      </div>
      <div className="flex flex-wrap gap-6 p-4 print:gap-0 print:p-0"><TagFaces item={item} /></div>
    </div>
  );
}
