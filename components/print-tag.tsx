"use client";

import { useEffect, useState } from "react";

import { TAG_FORMATS, TagFaces, readTagFormat, tagCss, type TagFormat, type TagItem } from "@/components/tag-faces";
import { PrintControls } from "@/components/print-controls";

/** One garment's tag, with a Print button; auto-prints with ?auto=1. */
export function PrintTag({ sku }: { sku: string }) {
  const [item, setItem] = useState<TagItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<TagFormat>("label2x1");
  useEffect(() => { setFormat(readTagFormat()); }, []);

  useEffect(() => {
    fetch(`/api/items/${encodeURIComponent(sku)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Not found."); setItem(j.item); })
      .catch((e) => setError(e.message));
  }, [sku]);

  const embed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1";
  useEffect(() => {
    if (item && new URLSearchParams(window.location.search).get("auto") === "1") setTimeout(() => window.print(), 400);
  }, [item]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!item) return <p className="p-6 text-neutral-500">Loading tag…</p>;
  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white">
      <style>{tagCss(format)}</style>
      {!embed && <div className="no-print flex items-center gap-3 p-4 text-sm">
        <PrintControls skus={[item.sku]} format={format} setFormat={setFormat} />
        <span className="text-neutral-600">{TAG_FORMATS.find((f) => f.code === format)?.size}</span>
        <a href={`/items/${item.sku}`} className="ml-auto text-neutral-600 underline">Garment</a>
      </div>}
      <div className="flex flex-wrap gap-6 p-4 print:gap-0 print:p-0"><TagFaces item={item} format={format} /></div>
    </div>
  );
}
