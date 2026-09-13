"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { drawOverlay, renderOverlay, silhouette, suggestLines, type Line } from "@/lib/measure-overlay";

export type MeasureInfo = { kind: "top" | "bottom" | "dress"; measurements: Record<string, unknown>; gender: string | null };

/**
 * Nudge the measurement lines on a garment's cut-out: drag either end of a
 * line, then Save renders the picture and uploads it (replacing the earlier
 * one). Auto puts the lines back where the silhouette suggests.
 */
export function MeasureEditor({ sku, cutoutUrl, info, initial, replacePath, onSaved, onClose }: {
  sku: string; cutoutUrl: string; info: MeasureInfo; initial: Line[] | null; replacePath: string | null;
  onSaved: (photo: { url: string; path: string }, lines: Line[]) => void; onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [lines, setLines] = useState<Line[] | null>(initial);
  const [auto, setAuto] = useState<Line[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ i: number; end: 1 | 2 } | null>(null);
  const SIDE = 640;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const b = await (await fetch(cutoutUrl)).blob();
        const bm = await createImageBitmap(b);
        const sil = await silhouette(bm);
        const suggested = suggestLines(sil, info.kind, info.measurements, info.gender);
        if (!live) return;
        setBlob(b); setBmp(bm); setAuto(suggested);
        setLines((l) => l && l.length ? l : suggested);
      } catch (e) { if (live) setError(e instanceof Error ? e.message : "Could not load the cut-out."); }
    })();
    return () => { live = false; };
  }, [cutoutUrl, info]);

  useEffect(() => {
    const c = canvasRef.current; if (!c || !bmp || !lines) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, SIDE, SIDE);
    ctx.drawImage(bmp, 0, 0, SIDE, SIDE);
    drawOverlay(ctx, SIDE, lines, { handles: true });
  }, [bmp, lines]);

  function at(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  function down(e: React.PointerEvent) {
    if (!lines) return;
    const p = at(e);
    let best: { i: number; end: 1 | 2; d: number } | null = null;
    lines.forEach((ln, i) => {
      for (const end of [1, 2] as const) {
        const d = Math.hypot(p.x - ln[`x${end}`], p.y - ln[`y${end}`]);
        if (d < 0.06 && (!best || d < best.d)) best = { i, end, d };
      }
    });
    if (best) { drag.current = best; (e.target as Element).setPointerCapture(e.pointerId); }
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d || !lines) return;
    const p = at(e);
    const x = Math.min(1, Math.max(0, p.x)), y = Math.min(1, Math.max(0, p.y));
    setLines(lines.map((ln, i) => (i === d.i ? { ...ln, [`x${d.end}`]: x, [`y${d.end}`]: y } : ln)));
  }
  function up() { drag.current = null; }

  async function save() {
    if (!blob || !lines) return;
    setBusy("Drawing…"); setError(null);
    try {
      const out = await renderOverlay(blob, lines, 2048);
      if (replacePath) await fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, path: replacePath }) });
      setBusy("Uploading…");
      const fd = new FormData();
      fd.append("sku", sku); fd.append("kind", "measure"); fd.append("file", out, "measure.jpg"); fd.append("lines", JSON.stringify(lines));
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed.");
      onSaved(j.photo, lines);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="w-full max-w-[680px] rounded-2xl bg-background p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold">Measurement lines · <span className="font-mono">{sku}</span></div>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">Close</button>
        </div>
        <canvas ref={canvasRef} width={SIDE} height={SIDE} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="aspect-square w-full touch-none rounded-lg border bg-white" />
        <p className="mt-2 text-xs text-muted-foreground">Drag the dots at the ends of a line to where the tape went. The numbers are what the tagger measured; change them on the garment page, not here.</p>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={save} disabled={!lines || !!busy}>{busy ?? "Save picture"}</Button>
          <Button type="button" variant="outline" onClick={() => auto && setLines(auto)} disabled={!auto}>Back to auto</Button>
          {lines && !lines.length && <span className="text-sm text-amber-700">No measurements were tagged for this garment, so there is nothing to draw.</span>}
        </div>
      </div>
    </div>
  );
}
