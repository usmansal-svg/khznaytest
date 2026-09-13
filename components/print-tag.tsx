"use client";

import { useEffect, useState } from "react";

import { TAG_FORMATS, TagFaces, readTagFormat, saveTagFormat, tagCss, type TagFormat, type TagItem } from "@/components/tag-faces";

/** One garment's tag, with a Print button; auto-prints with ?auto=1. */
export function PrintTag({ sku }: { sku: string }) {
  const [item, setItem] = useState<TagItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<TagFormat>("label");
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
        <button onClick={() => window.print()} className="rounded-md bg-black px-4 py-2 font-semibold text-white">Print tag</button>
        <label className="flex items-center gap-1.5 text-neutral-600">Paper
          <select value={format} onChange={(e) => { const f = e.target.value as TagFormat; setFormat(f); saveTagFormat(f); }} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black">
            {TAG_FORMATS.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
          </select>
        </label>
        <span className="text-neutral-600">{TAG_FORMATS.find((f) => f.code === format)?.size} · one page per tag · print at 100%, no margins</span>
        <a href={`/items/${item.sku}`} className="ml-auto text-neutral-600 underline">Garment</a>
      </div>}
      <div className="flex flex-wrap gap-6 p-4 print:gap-0 print:p-0"><TagFaces item={item} format={format} /></div>
    </div>
  );
}
