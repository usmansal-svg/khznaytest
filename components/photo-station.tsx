"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Scissors, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { compressUnder, cutoutOnWhite, squareForShopify } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * Review one garment's pictures: full-screen view on tap, delete, remove
 * the background of any one, press-and-hold drag to reorder (saved at
 * once — the order is the Shopify order), and add more shots.
 */

type Photo = { path: string; url: string; kind: "original" | "cutout"; bytes: number; taken_at: string };
type Item = { sku: string; brand: string | null; sub_category: string; category: string; size_label: string | null; grade_code: string; colour: string | null; channel: string; photos: Photo[] };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`);

export function PhotoStation({ sku }: { sku: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [autoCut, setAutoCut] = useState(true);
  const [view, setView] = useState<number | null>(null); // index into originals
  const [dragPath, setDragPath] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);
  const touchX = useRef<number | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => { try { setAutoCut(localStorage.getItem("khz_autocut") !== "off"); } catch { /* fine */ } }, []);
  function setAuto(v: boolean) { setAutoCut(v); try { localStorage.setItem("khz_autocut", v ? "on" : "off"); } catch { /* fine */ } }

  const load = useCallback(async () => {
    const res = await fetch(`/api/items/${encodeURIComponent(sku)}`);
    const j = await res.json();
    if (!res.ok) { setError(j.error ?? "Not found."); return; }
    const it = j.item ?? j;
    setItem({ sku: it.sku, brand: it.brand ?? null, sub_category: it.sub_category ?? "", category: it.category ?? "", size_label: it.size_label, grade_code: it.grade ?? it.grade_code, colour: it.colour, channel: it.channel, photos: it.photos ?? [] });
  }, [sku]);
  useEffect(() => { void load(); }, [load]);

  async function upload(file: Blob, kind: "original" | "cutout"): Promise<Photo> {
    const fd = new FormData();
    fd.append("sku", sku); fd.append("kind", kind); fd.append("file", file, kind === "cutout" ? "cutout.jpg" : "photo.jpg");
    const res = await fetch("/api/photos", { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Upload failed.");
    return j.photo as Photo;
  }
  async function cutout(source: Blob | string): Promise<Photo> {
    const { removeBackground } = await import("@imgly/background-removal");
    const src = typeof source === "string" ? await (await fetch(source)).blob() : source;
    const png = await removeBackground(src, { output: { format: "image/png", quality: 0.9 } });
    const shadowed = await cutoutOnWhite(png, 2048);
    const jpg = shadowed.size > 1024 * 1024 ? await squareForShopify(shadowed, 2048, 1024 * 1024) : shadowed;
    return upload(jpg, "cutout");
  }
  async function onShot(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !item) return;
    setBusy("shot"); setNote(null);
    try {
      const isFirst = item.photos.filter((p) => p.kind === "original").length === 0;
      for (const f of files) {
        const small = await squareForShopify(await compressUnder(f, 8 * 1024 * 1024, 4096), 2048, 1024 * 1024);
        await upload(small, "original");
        if (isFirst && autoCut) { setNote("Removing the background of the first picture…"); await cutout(small); }
      }
      await load(); setNote(null);
    } catch (err) { setNote(err instanceof Error ? err.message : "Upload failed."); } finally { setBusy(null); }
  }
  async function cutExisting(p: Photo) {
    setBusy(p.path); setNote("Removing background…");
    try { await cutout(p.url); await load(); setNote(null); } catch (err) { setNote(err instanceof Error ? err.message : "Background removal failed."); } finally { setBusy(null); }
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
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={onShot} />

      {/* ---- full-screen viewer */}
      {current && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <button type="button" onClick={() => setView(null)} className="flex items-center gap-1"><X className="size-5" /> Close</button>
            <span>Picture {view! + 1} of {originals.length}{view === 0 ? " · cover" : ""}</span>
            <span className="text-xs text-white/60">{kb(current.bytes)}</span>
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
              <span>Background removed · {kb(cutFor(current)!.bytes)}</span>
              <button type="button" disabled={busy != null} onClick={() => remove(cutFor(current)!)} className="ml-auto underline">delete cut-out</button>
            </div>
          )}
          <div className="flex gap-2 bg-neutral-900 px-4 pb-6 pt-3 text-sm">
            {!cutFor(current) && <button type="button" disabled={busy != null} onClick={() => cutExisting(current)} className="flex flex-1 items-center justify-center gap-1 rounded border border-white/40 py-3"><Scissors className="size-4" /> {busy === current.path ? "Working…" : "Remove background"}</button>}
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
      {note && <p className="text-sm text-muted-foreground">{note}</p>}

      {originals.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No pictures yet.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Tap a picture for the full view. Press and hold, then drag, to change the order — picture 1 is the cover and the order is the order on Shopify.</p>
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
                  <div className="grid grid-cols-2 divide-x border-t text-[11px]">
                    <button type="button" disabled={busy != null} onClick={() => remove(p)} className="flex items-center justify-center gap-1 py-1.5 text-red-700 dark:text-red-400"><Trash2 className="size-3.5" /> Delete</button>
                    {cut
                      ? <span className="flex items-center justify-center gap-1 py-1.5 text-muted-foreground"><Scissors className="size-3.5" /> Cut out</span>
                      : <button type="button" disabled={busy != null} onClick={() => cutExisting(p)} className="flex items-center justify-center gap-1 py-1.5"><Scissors className="size-3.5" /> {busy === p.path ? "Working…" : "No background"}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Button type="button" size="lg" className="h-14 w-full text-base" disabled={busy != null} onClick={() => cameraRef.current?.click()}><Camera className="size-5" /> {busy === "shot" ? "Saving…" : "Take another picture"}</Button>
      <label className="flex items-center gap-2 text-xs"><Checkbox checked={autoCut} onCheckedChange={(v) => setAuto(v === true)} /> Remove the background from the first picture automatically</label>
    </div>
  );
}
