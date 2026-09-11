"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Review one garment's pictures: full-screen view on tap, delete, remove
 * the background of any one, press-and-hold drag to reorder (saved at
 * once — the order is the Shopify order), and add more shots.
 */

type Photo = { path: string; url: string; kind: "original" | "cutout"; bytes: number; taken_at: string };
type Item = { sku: string; brand: string | null; sub_category: string; category: string; size_label: string | null; grade_code: string; colour: string | null; channel: string; photos: Photo[] };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };

export function PhotoStation({ sku }: { sku: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [view, setView] = useState<number | null>(null); // index into originals
  const [dragPath, setDragPath] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);
  const touchX = useRef<number | null>(null);


  const load = useCallback(async () => {
    const res = await fetch(`/api/items/${encodeURIComponent(sku)}`);
    const j = await res.json();
    if (!res.ok) { setError(j.error ?? "Not found."); return; }
    const it = j.item ?? j;
    setItem({ sku: it.sku, brand: it.brand ?? null, sub_category: it.sub_category ?? "", category: it.category ?? "", size_label: it.size_label, grade_code: it.grade ?? it.grade_code, colour: it.colour, channel: it.channel, photos: it.photos ?? [] });
  }, [sku]);
  useEffect(() => { void load(); }, [load]);

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

  // ---- press-and-hold drag to reorder
  function onTileDown(path: string) { holdTimer.current = window.setTimeout(() => { setDragPath(path); if (navigator.vibrate) navigator.vibrate(10); }, 250); }
  function cancelHold() { if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; } }
  function onGridMove(e: React.PointerEvent) {
    if (!dragPath || !item) return;
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-path]");
    const over = el?.dataset.path;
    if (!over || over === dragPath) return;
    setItem((it) => {
      if (!it) return it;
      const originals = it.photos.filter((p) => p.kind === "original");
      const cutouts = it.photos.filter((p) => p.kind === "cutout");
      const from = originals.findIndex((p) => p.path === dragPath);
      const to = originals.findIndex((p) => p.path === over);
      if (from < 0 || to < 0) return it;
      const c = [...originals]; const [m] = c.splice(from, 1); c.splice(to, 0, m);
      return { ...it, photos: [...c, ...cutouts] };
    });
  }
  function endDrag() {
    cancelHold();
    if (dragPath && item) void saveOrder(item.photos.filter((p) => p.kind === "original").map((p) => p.path));
    setDragPath(null);
  }

  if (error) return <div className="mx-auto max-w-3xl space-y-3"><p className="text-destructive">{error}</p><Button asChild variant="outline"><Link href="/photos"><ArrowLeft className="size-4" /> Back</Link></Button></div>;
  if (!item) return <p className="text-muted-foreground">Loading…</p>;

  const originals = item.photos.filter((p) => p.kind === "original");
  const cutouts = item.photos.filter((p) => p.kind === "cutout");
  const cutFor = (p: Photo) => cutouts.find((c) => c.taken_at > p.taken_at && !originals.some((o) => o.taken_at > p.taken_at && o.taken_at < c.taken_at));
  const current = view != null ? originals[view] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ---- full-screen viewer */}
      {current && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <button type="button" onClick={() => setView(null)} className="flex items-center gap-1"><X className="size-5" /> Close</button>
            <span>Picture {view! + 1} of {originals.length}{view === 0 ? " · cover" : ""}</span>
            <span className="w-12" />
          </div>
          <div className="relative flex-1 overflow-hidden"
            onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
            onTouchEnd={(e) => { const x0 = touchX.current; touchX.current = null; const x1 = e.changedTouches[0]?.clientX; if (x0 == null || x1 == null) return; const dx = x1 - x0; if (dx < -40) setView((i) => Math.min(originals.length - 1, (i ?? 0) + 1)); if (dx > 40) setView((i) => Math.max(0, (i ?? 0) - 1)); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt="" className="h-full w-full object-contain" />
            {view! > 0 && <button type="button" onClick={() => setView((i) => (i ?? 1) - 1)} className="absolute left-0 top-0 h-full w-1/5" aria-label="Previous"><ChevronLeft className="absolute left-2 top-1/2 size-8 -translate-y-1/2 opacity-70" /></button>}
            {view! < originals.length - 1 && <button type="button" onClick={() => setView((i) => (i ?? 0) + 1)} className="absolute right-0 top-0 h-full w-1/5" aria-label="Next"><ChevronRight className="absolute right-2 top-1/2 size-8 -translate-y-1/2 opacity-70" /></button>}
          </div>
          {cutFor(current) && (
            <div className="flex items-center gap-3 bg-neutral-900 px-4 py-2 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cutFor(current)!.url} alt="cut-out" className="h-14 w-14 rounded border border-white/20 bg-white object-contain" />
              <span>Cover cut-out · background removed</span>
            </div>
          )}
          <div className="flex gap-2 bg-neutral-900 px-4 pb-6 pt-3 text-sm">
            <button type="button" disabled={busy != null} onClick={() => remove(current)} className="flex flex-1 items-center justify-center gap-1 rounded border border-red-400 py-3 text-red-300"><Trash2 className="size-4" /> Delete this picture</button>
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
          <div className="grid grid-cols-3 gap-2 select-none" onPointerMove={onGridMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag} style={{ touchAction: dragPath ? "none" : "auto" }}>
            {originals.map((p, i) => {
              const cut = cutFor(p);
              return (
                <div key={p.path} data-path={p.path} className={cn("flex flex-col overflow-hidden rounded-md border-2 bg-background", i === 0 ? "border-amber-500" : "border-transparent", dragPath === p.path && "scale-105 shadow-xl ring-2 ring-primary")}>
                  <div className="relative aspect-square" onPointerDown={() => onTileDown(p.path)} onPointerUp={cancelHold} onPointerCancel={cancelHold} onContextMenu={(e) => e.preventDefault()}>
                    <button type="button" onClick={() => { if (!dragPath) setView(i); }} className="h-full w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={`Picture ${i + 1}`} draggable={false} className="h-full w-full object-cover" />
                    </button>
                    {i === 0 && <span className="absolute inset-x-0 top-0 bg-amber-500 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-black">★ Cover</span>}
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-xs font-semibold text-white">{i + 1}</span>
                    {cut && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={cut.url} alt="cut-out" className="absolute bottom-1 right-1 h-8 w-8 rounded border bg-white object-contain" title="Background removed" />
                    )}
                  </div>
                  <button type="button" disabled={busy != null} onClick={() => remove(p)} className="flex items-center justify-center gap-1 border-t py-1.5 text-[11px] text-red-700 dark:text-red-400"><Trash2 className="size-3.5" /> Delete</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Button asChild size="lg" className="h-14 w-full text-base"><Link href={`/photos?sku=${encodeURIComponent(item.sku)}`}><Camera className="size-5" /> Add more pictures</Link></Button>
      <p className="text-center text-xs text-muted-foreground">Opens the camera with these pictures loaded, so you can add, adjust or replace and the cover gets its background removed there.</p>
    </div>
  );
}
