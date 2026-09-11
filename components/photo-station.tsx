"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, RotateCw, Scissors, SlidersHorizontal, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHoldDrag } from "@/lib/hold-drag";
import { applyAdjust, cutoutOnWhite, NO_ADJUST, squareForShopify, type Adjust } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * Review one garment's pictures: full-screen view on tap, delete, remove
 * the background of any one, press-and-hold drag to reorder (saved at
 * once — the order is the Shopify order), and add more shots.
 */

type Photo = { path: string; url: string; kind: "original" | "cutout"; bytes: number; taken_at: string; source?: string };
type Item = { sku: string; brand: string | null; sub_category: string; category: string; size_label: string | null; grade_code: string; colour: string | null; channel: string; photos: Photo[] };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };

export function PhotoStation({ sku }: { sku: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [view, setView] = useState<number | null>(null); // index into originals
  const [showOriginal, setShowOriginal] = useState(false);
  const [adjust, setAdjust] = useState<Adjust | null>(null); // open editor for the full-view picture
  const touchX = useRef<number | null>(null);


  const load = useCallback(async () => {
    const res = await fetch(`/api/items/${encodeURIComponent(sku)}`);
    const j = await res.json();
    if (!res.ok) { setError(j.error ?? "Not found."); return; }
    const it = j.item ?? j;
    setItem({ sku: it.sku, brand: it.brand ?? null, sub_category: it.sub_category ?? "", category: it.category ?? "", size_label: it.size_label, grade_code: it.grade ?? it.grade_code, colour: it.colour, channel: it.channel, photos: it.photos ?? [] });
  }, [sku]);
  useEffect(() => { void load(); }, [load]);

  // Background removal from the full view only: the picture is cut out on the
  // phone and lands on white with a soft shadow; an earlier cut-out for this
  // garment is replaced.
  async function cutExisting(p: Photo) {
    if (!item) return;
    setBusy(p.path); setNote("Removing the background — the first run downloads the model once…");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const src = await (await fetch(p.url)).blob();
      const png = await removeBackground(src, { output: { format: "image/png", quality: 0.9 } });
      const shadowed = await cutoutOnWhite(png, 2048);
      const jpg = shadowed.size > 1024 * 1024 ? await squareForShopify(shadowed, 2048, 1024 * 1024) : shadowed;
      const old = cutFor(p);
      if (old) await fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, path: old.path }) });
      const fd = new FormData();
      fd.append("sku", sku); fd.append("kind", "cutout"); fd.append("source", p.path); fd.append("file", jpg, "cutout.jpg");
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed.");
      await load(); setNote(null);
    } catch (err) { setNote(err instanceof Error ? err.message : "Background removal failed."); } finally { setBusy(null); }
  }

  // Brightness / contrast / rotate on a picture that was saved earlier: the
  // edited picture replaces the file in the same position; a cut-out made
  // from the old version is removed (redo it after).
  async function applyEdit(p: Photo, a: Adjust) {
    if (!item) return;
    setBusy(p.path); setNote("Applying…");
    try {
      const src = await (await fetch(p.url)).blob();
      const square = await squareForShopify(await applyAdjust(src, a), 2048, 1024 * 1024);
      const fd = new FormData();
      fd.append("sku", sku); fd.append("kind", "original"); fd.append("file", square, "photo.jpg");
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed.");
      const newPath = (j.photo as Photo).path;
      const old = cutFor(p);
      if (old) await fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, path: old.path }) });
      await fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, path: p.path }) });
      const order = originals.map((o) => (o.path === p.path ? newPath : o.path));
      await saveOrder(order);
      await load();
      setAdjust(null);
      setNote(old ? "Applied. The cut-out was made from the old version — tap Remove background to redo it." : null);
    } catch (err) { setNote(err instanceof Error ? err.message : "Could not apply."); } finally { setBusy(null); }
  }

  async function remove(p: Photo) {
    if (!window.confirm("Delete this picture?")) return;
    setBusy(p.path);
    try {
      const res = await fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, path: p.path }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setView(null);
      await load();
    } catch (err) { setNote(err instanceof Error ? err.message : "Delete failed."); } finally { setBusy(null); }
  }
  async function saveOrder(paths: string[]) {
    await fetch("/api/photos", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, order: paths }) });
  }

  // ---- press-and-hold drag to reorder; the order is saved on drop
  const originalsNow = item?.photos.filter((p) => p.kind === "original") ?? [];
  const drag = useHoldDrag<string>(
    originalsNow.map((p) => p.path),
    (from, to) => setItem((it) => {
      if (!it) return it;
      const originals = it.photos.filter((p) => p.kind === "original");
      const cutouts = it.photos.filter((p) => p.kind === "cutout");
      const a = originals.findIndex((p) => p.path === from);
      const b = originals.findIndex((p) => p.path === to);
      if (a < 0 || b < 0) return it;
      const c = [...originals]; const [m] = c.splice(a, 1); c.splice(b, 0, m);
      return { ...it, photos: [...c, ...cutouts] };
    }),
    () => { if (item) void saveOrder(item.photos.filter((p) => p.kind === "original").map((p) => p.path)); },
  );

  if (error) return <div className="mx-auto max-w-3xl space-y-3"><p className="text-destructive">{error}</p><Button asChild variant="outline"><Link href="/photos"><ArrowLeft className="size-4" /> Back</Link></Button></div>;
  if (!item) return <p className="text-muted-foreground">Loading…</p>;

  const originals = item.photos.filter((p) => p.kind === "original");
  const cutouts = item.photos.filter((p) => p.kind === "cutout");
  // A cut-out belongs to the picture it was made from (older cut-outs, made before that was recorded, fall back to "the next one taken").
  const cutFor = (p: Photo) => cutouts.find((c) => c.source === p.path) ?? cutouts.find((c) => !c.source && c.taken_at > p.taken_at && !originals.some((o) => o.taken_at > p.taken_at && o.taken_at < c.taken_at));
  const shown = (p: Photo) => cutFor(p)?.url ?? p.url;
  const current = view != null ? originals[view] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ---- full-screen viewer */}
      {current && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <button type="button" onClick={() => { setView(null); setShowOriginal(false); setAdjust(null); }} className="flex items-center gap-1"><X className="size-5" /> Close</button>
            <span>Picture {view! + 1} of {originals.length}{view === 0 ? " · cover" : ""}</span>
            <span className="w-12" />
          </div>
          <div className="relative flex-1 overflow-hidden"
            onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
            onTouchEnd={(e) => { const x0 = touchX.current; touchX.current = null; const x1 = e.changedTouches[0]?.clientX; if (x0 == null || x1 == null) return; const dx = x1 - x0; if (Math.abs(dx) > 40) setAdjust(null); if (dx < -40) setView((i) => Math.min(originals.length - 1, (i ?? 0) + 1)); if (dx > 40) setView((i) => Math.max(0, (i ?? 0) - 1)); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={showOriginal || adjust ? current.url : shown(current)} alt="" className="h-full w-full object-contain" style={adjust ? { filter: `brightness(${adjust.brightness}) contrast(${adjust.contrast})`, transform: `rotate(${adjust.rotate}deg)` } : undefined} />
            {cutFor(current) && <button type="button" onClick={() => setShowOriginal((v) => !v)} className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-black">{showOriginal ? "Showing original · tap for cut-out" : "Background removed · tap for original"}</button>}
            {view! > 0 && <button type="button" onClick={() => setView((i) => (i ?? 1) - 1)} className="absolute left-0 top-0 h-full w-1/5" aria-label="Previous"><ChevronLeft className="absolute left-2 top-1/2 size-8 -translate-y-1/2 opacity-70" /></button>}
            {view! < originals.length - 1 && <button type="button" onClick={() => setView((i) => (i ?? 0) + 1)} className="absolute right-0 top-0 h-full w-1/5" aria-label="Next"><ChevronRight className="absolute right-2 top-1/2 size-8 -translate-y-1/2 opacity-70" /></button>}
          </div>
          {note && <p className="bg-neutral-900 px-4 pt-2 text-xs text-amber-300">{note}</p>}
          {adjust && (
            <div className="space-y-3 bg-neutral-900 px-4 pt-3">
              {(["brightness", "contrast"] as const).map((key) => {
                const val = adjust[key];
                const set = (v: number) => setAdjust((a) => (a ? { ...a, [key]: Math.round(Math.min(1.4, Math.max(0.6, v)) * 100) / 100 } : a));
                return (
                  <div key={key} className="grid grid-cols-[5.5rem_2.5rem_1fr_2.5rem_3rem] items-center gap-2 text-xs">
                    <span className="capitalize">{key}</span>
                    <button type="button" onClick={() => set(val - 0.05)} className="h-9 rounded border border-white/40 text-lg leading-none">−</button>
                    <input type="range" min="0.6" max="1.4" step="0.02" value={val} onChange={(e) => set(Number(e.target.value))} className="accent-white" />
                    <button type="button" onClick={() => set(val + 0.05)} className="h-9 rounded border border-white/40 text-lg leading-none">+</button>
                    <span className="text-right tabular-nums">{val > 1 ? "+" : ""}{Math.round((val - 1) * 100)}</span>
                  </div>
                );
              })}
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => setAdjust((a) => (a ? { ...a, rotate: ((a.rotate + 90) % 360) as Adjust["rotate"] } : a))} className="flex items-center gap-1 rounded border border-white/40 px-3 py-2"><RotateCw className="size-4" /> Rotate</button>
                <button type="button" onClick={() => setAdjust({ ...NO_ADJUST })} className="rounded border border-white/40 px-3 py-2">Reset</button>
                <button type="button" onClick={() => setAdjust(null)} className="ml-auto rounded border border-white/40 px-3 py-2">Cancel</button>
                <button type="button" disabled={busy != null} onClick={() => applyEdit(current, adjust)} className="rounded bg-white px-4 py-2 font-semibold text-black disabled:opacity-40">{busy === current.path ? "Applying…" : "Apply"}</button>
              </div>
            </div>
          )}
          <div className="flex gap-2 bg-neutral-900 px-4 pb-6 pt-3 text-sm">
            {!adjust && <button type="button" disabled={busy != null} onClick={() => { setAdjust({ ...NO_ADJUST }); setShowOriginal(false); }} className="flex flex-1 items-center justify-center gap-1 rounded border border-white/40 py-3"><SlidersHorizontal className="size-4" /> Adjust</button>}
            <button type="button" disabled={busy != null} onClick={() => cutExisting(current)} className="flex flex-1 items-center justify-center gap-1 rounded border border-white/40 py-3"><Scissors className="size-4" /> {busy === current.path ? "Working…" : cutFor(current) ? "Redo background" : "Remove background"}</button>
            {cutFor(current) && <button type="button" disabled={busy != null} onClick={() => remove(cutFor(current)!)} className="flex items-center justify-center gap-1 rounded border border-white/40 px-3 py-3" title="Put the original back">Undo</button>}
            <button type="button" disabled={busy != null} onClick={() => remove(current)} className="flex flex-1 items-center justify-center gap-1 rounded border border-red-400 py-3 text-red-300"><Trash2 className="size-4" /> Delete</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-sm text-muted-foreground">{item.sku}</p>
          <h1 className="text-xl font-bold">{item.brand ?? "—"} · {item.sub_category}</h1>
          <p className="text-sm text-muted-foreground">{item.category} · {GRADE[item.grade_code] ?? item.grade_code}{item.size_label ? ` · Size ${item.size_label}` : ""}{item.colour ? ` · ${item.colour}` : ""}</p>
        </div>
        <Button asChild variant="outline"><Link href="/photos"><ArrowLeft className="size-4" /> Back</Link></Button>
      </div>
      {item.channel !== "online" && <p className="rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">Outlet stock, not an online garment.</p>}
      {note && <p className="text-sm text-destructive">{note}</p>}

      {originals.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No pictures yet.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{originals.length} picture{originals.length === 1 ? "" : "s"} · picture 1 is the cover{cutouts.length ? " (background removed)" : ""}. Tap for the full view; press and hold, then drag, to reorder — the order is the order on Shopify.</p>
          <div className="grid grid-cols-3 gap-2 select-none">
            {originals.map((p, i) => {
              const cut = cutFor(p);
              return (
                <div key={p.path} data-key={p.path} className={cn("flex flex-col overflow-hidden rounded-md border-2 bg-background", i === 0 ? "border-amber-500" : "border-transparent", drag.dragKey === p.path && "opacity-30")}>
                  <div className="relative aspect-square" style={{ touchAction: "none" }} onPointerDown={drag.onPointerDown(p.path, p.url)} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp} onPointerCancel={drag.onPointerCancel} onContextMenu={(e) => e.preventDefault()}>
                    <button type="button" onClick={() => { if (drag.dragKey == null) setView(i); }} className="h-full w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shown(p)} alt={`Picture ${i + 1}`} draggable={false} className="h-full w-full object-cover" />
                    </button>
                    {i === 0 && <span className="absolute inset-x-0 top-0 bg-amber-500 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-black">★ Cover</span>}
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-xs font-semibold text-white">{i + 1}</span>
                    {cut && <span className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[10px] font-semibold text-black">no bg</span>}
                  </div>
                  <button type="button" disabled={busy != null} onClick={() => remove(p)} className="flex items-center justify-center gap-1 border-t py-1.5 text-[11px] text-red-700 dark:text-red-400"><Trash2 className="size-3.5" /> Delete</button>
                </div>
              );
            })}
          </div>
          {drag.ghost && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={drag.ghost.url} alt="" className="pointer-events-none fixed z-50 rounded-md object-cover shadow-2xl ring-2 ring-primary" style={{ left: drag.ghost.x, top: drag.ghost.y, width: drag.ghost.w, height: drag.ghost.h }} />
          )}
        </>
      )}

      <Button asChild size="lg" className="h-14 w-full text-base"><Link href={`/photos?sku=${encodeURIComponent(item.sku)}`}><Camera className="size-5" /> Add more pictures</Link></Button>
      <p className="text-center text-xs text-muted-foreground">Opens the camera with these pictures loaded, so you can add, adjust or replace and the cover gets its background removed there.</p>
    </div>
  );
}
