"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, RefreshCw, ScanLine, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cutoutOnWhite, squareForShopify } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * The photography station, built for an iPhone in one hand:
 *
 *   scan the tag → the same camera becomes the shutter → take up to six
 *   shots → untick the bad ones → Save → straight back to scanning.
 *
 * Saving runs in the background: each shot is centre-cropped square, sized
 * for Shopify (2048 px, under 1 MB) and uploaded; the first kept shot also
 * has its background removed on the phone and lands as a shadowed cut-out
 * on white. A strip at the top shows what is still in flight.
 */

type Row = { sku: string; brand: string | null; size: string | null; grade: string; tagged_at: string; online_status: string | null; sub_category: string; photos: number; cutouts: number; photographed_at: string | null; photographer: string | null };
type Me = { name: string; role: string; today: number; target: number; pct: number };
type Garment = { sku: string; brand: string | null; sub_category: string; size_label: string | null; grade: string; channel: string; photos: number; paths: string[] };
type Shot = { id: number; blob: Blob; url: string; keep: boolean; w: number; h: number };
type Job = { sku: string; total: number; done: number; cutout: "pending" | "working" | "done" | "skipped" | "failed"; error?: string; cutoutUrl?: string };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const MAX_SHOTS = 6;

export function PhotosPage() {
  const [data, setData] = useState<{ waiting: Row[]; done: Row[]; total_online: number; me: Me; sees_names?: boolean } | null>(null);
  const [listFilter, setListFilter] = useState<"all" | "none" | "done">("all");
  const [replaceOld, setReplaceOld] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "scan" | "shoot">("idle");
  const [garment, setGarment] = useState<Garment | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [manual, setManual] = useState("");
  const [camInfo, setCamInfo] = useState<string | null>(null);
  const [autoCut, setAutoCut] = useState(true);
  const [flash, setFlash] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanStop = useRef<(() => void) | null>(null);
  const shotId = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/photos/queue");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the queue."); }
  }, []);
  useEffect(() => { void load(); try { setAutoCut(localStorage.getItem("khz_autocut") !== "off"); } catch { /* fine */ } }, [load]);
  function setAuto(v: boolean) { setAutoCut(v); try { localStorage.setItem("khz_autocut", v ? "on" : "off"); } catch { /* fine */ } }

  // Leaving the page would abandon background uploads.
  useEffect(() => {
    const pending = jobs.some((j) => j.done < j.total || j.cutout === "pending" || j.cutout === "working");
    if (!pending) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [jobs]);

  /* ------------------------------------------------------------ camera */

  async function openCamera(): Promise<MediaStream> {
    if (streamRef.current) return streamRef.current;
    // Ask for the most the phone will give: the rear camera at its highest
    // frame size. What we actually get is shown on screen.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 4096 } } });
    streamRef.current = stream;
    const v = videoRef.current!;
    v.srcObject = stream;
    await v.play();
    const s = stream.getVideoTracks()[0]?.getSettings();
    if (s?.width && s?.height) setCamInfo(`${s.width} × ${s.height}`);
    return stream;
  }
  function closeCamera() {
    scanStop.current?.();
    scanStop.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }
  useEffect(() => () => closeCamera(), []);

  async function startScan() {
    setError(null);
    setGarment(null);
    setShots((s) => { s.forEach((x) => URL.revokeObjectURL(x.url)); return []; });
    try {
      await openCamera();
      setMode("scan");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoElement(videoRef.current!, (result) => {
        const text = result?.getText()?.trim().toUpperCase();
        if (text && /^KHZ-/.test(text)) {
          controls.stop();
          scanStop.current = null;
          void pick(text);
        }
      });
      scanStop.current = () => controls.stop();
    } catch (e) {
      setError(e instanceof Error ? `Camera: ${e.message}. On iPhone, allow the camera for this site in Settings → Safari.` : "Camera unavailable.");
      setMode("idle");
    }
  }

  async function pick(sku: string, retake = false) {
    setError(null);
    const r = await fetch(`/api/items/${encodeURIComponent(sku)}`);
    const j = await r.json();
    if (!r.ok) { setError(j.error ?? `No garment ${sku}.`); await startScan(); return; }
    const it = j.item ?? j;
    setGarment({ sku: it.sku, brand: it.brand ?? null, sub_category: it.sub_category ?? "", size_label: it.size_label, grade: it.grade ?? it.grade_code, channel: it.channel, photos: (it.photos ?? []).length, paths: ((it.photos ?? []) as { path: string }[]).map((p) => p.path) });
    setReplaceOld(retake && (it.photos ?? []).length > 0);
    setShots([]);
    // The same stream becomes the shutter: no navigation, no second screen.
    try { await openCamera(); setMode("shoot"); } catch { setMode("idle"); }
  }

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    if (shots.length >= MAX_SHOTS) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setFlash(true); setTimeout(() => setFlash(false), 120);
    c.toBlob((b) => {
      if (!b) return;
      const id = ++shotId.current;
      setShots((s) => [...s, { id, blob: b, url: URL.createObjectURL(b), keep: true, w: c.width, h: c.height }]);
    }, "image/jpeg", 0.95);
  }

  // Fallback for phones that will not stream the camera: the native camera app, one shot at a time.
  function onNative(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files.slice(0, MAX_SHOTS - shots.length)) {
      const id = ++shotId.current;
      setShots((s) => [...s, { id, blob: f, url: URL.createObjectURL(f), keep: true, w: 0, h: 0 }]);
    }
  }

  /* ------------------------------------------------------- background save */

  function save() {
    if (!garment) return;
    const kept = shots.filter((s) => s.keep);
    if (!kept.length) return;
    const sku = garment.sku;
    const wantCut = autoCut;
    const oldPaths = replaceOld ? garment.paths : [];
    const job: Job = { sku, total: kept.length, done: 0, cutout: wantCut ? "pending" : "skipped" };
    setJobs((j) => [job, ...j.filter((x) => x.sku !== sku)].slice(0, 12));
    // Fire and forget: the photographer scans the next garment meanwhile.
    void (async () => {
      const update = (patch: Partial<Job>) => setJobs((j) => j.map((x) => (x.sku === sku ? { ...x, ...patch } : x)));
      let firstSquare: Blob | null = null;
      try {
        // A retake replaces: the old pictures go before the new ones land.
        for (const path of oldPaths) {
          await fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, path }) });
        }
        for (const shot of kept) {
          const square = await squareForShopify(shot.blob, 2048, 1024 * 1024);
          if (!firstSquare) firstSquare = square;
          await upload(sku, square, "original");
          update({ done: kept.indexOf(shot) + 1 });
        }
      } catch (e) {
        update({ error: e instanceof Error ? e.message : "Upload failed.", cutout: "failed" });
        return;
      }
      if (wantCut && firstSquare) {
        update({ cutout: "working" });
        try {
          const { removeBackground } = await import("@imgly/background-removal");
          const png = await removeBackground(firstSquare, { output: { format: "image/png", quality: 0.9 } });
          const shadowed = await cutoutOnWhite(png, 2048);
          const small = shadowed.size > 1024 * 1024 ? await squareForShopify(shadowed, 2048, 1024 * 1024) : shadowed;
          const photo = await upload(sku, small, "cutout");
          update({ cutout: "done", cutoutUrl: photo.url });
        } catch (e) {
          update({ cutout: "failed", error: e instanceof Error ? e.message : "Background removal failed." });
        }
      }
      void load();
    })();
    // Straight back to scanning.
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
    setGarment(null);
    void startScan();
  }

  async function upload(sku: string, file: Blob, kind: "original" | "cutout"): Promise<{ url: string }> {
    const fd = new FormData();
    fd.append("sku", sku);
    fd.append("kind", kind);
    fd.append("file", file, kind === "cutout" ? "cutout.jpg" : "photo.jpg");
    const res = await fetch("/api/photos", { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Upload failed.");
    return j.photo;
  }

  const kept = shots.filter((s) => s.keep).length;
  const me = data?.me;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ------------------------------------------------ target */}
      {me && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
          <div>
            <div className="text-sm font-semibold">{me.name}</div>
            <div className="text-xs text-muted-foreground">{me.today} of {me.target} garments photographed today</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 w-32 rounded bg-muted"><div className={cn("h-2 rounded", me.pct >= 100 ? "bg-green-600" : "bg-foreground/70")} style={{ width: `${Math.min(100, me.pct)}%` }} /></div>
            <div className={cn("text-lg font-bold tabular-nums", me.pct >= 100 && "text-green-700 dark:text-green-400")}>{me.pct}%</div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ jobs strip */}
      {jobs.length > 0 && (
        <ul className="space-y-1 text-xs">
          {jobs.slice(0, 4).map((j) => (
            <li key={j.sku} className={cn("flex flex-wrap items-center gap-2 rounded-md border px-2 py-1", j.error ? "border-red-400" : j.done < j.total || j.cutout === "working" || j.cutout === "pending" ? "border-amber-400" : "border-green-500")}>
              <span className="font-mono">{j.sku}</span>
              <span className="text-muted-foreground">{j.done}/{j.total} uploaded</span>
              {j.cutout === "pending" && <span className="text-muted-foreground">· cut-out queued</span>}
              {j.cutout === "working" && <span className="text-amber-700 dark:text-amber-400">· removing background…</span>}
              {j.cutout === "done" && <span className="text-green-700 dark:text-green-400">· cut-out ready</span>}
              {j.cutout === "failed" && <span className="text-red-700 dark:text-red-400">· {j.error ?? "cut-out failed"}</span>}
              {j.cutoutUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={j.cutoutUrl} alt="" className="ml-auto h-8 w-8 rounded border object-contain" />
              )}
              <Link href={`/photos/${encodeURIComponent(j.sku)}`} className="ml-auto underline">check</Link>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* ------------------------------------------------ camera */}
      <Card className="overflow-hidden">
        <div className="relative aspect-square bg-black">
          <video ref={videoRef} playsInline muted className={cn("h-full w-full object-cover", mode === "idle" && "hidden")} />
          {flash && <div className="absolute inset-0 bg-white/80" />}
          {mode === "scan" && (
            <>
              <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-white/80" />
              <div className="absolute bottom-3 left-0 right-0 text-center text-sm font-medium text-white drop-shadow">Point at the barcode on the tag</div>
            </>
          )}
          {mode === "shoot" && garment && (
            <div className="absolute left-0 right-0 top-0 bg-black/55 px-3 py-2 text-white">
              <div className="font-mono text-xs">{garment.sku}{garment.channel !== "online" ? " · outlet stock" : ""}</div>
              <div className="text-sm font-semibold">{garment.brand ?? "—"} · {garment.sub_category}{garment.size_label ? ` · ${garment.size_label}` : ""} · {GRADE[garment.grade] ?? garment.grade}</div>
              {garment.photos > 0 && (
                <label className="mt-1 flex items-center gap-2 text-xs text-amber-300"><Checkbox checked={replaceOld} onCheckedChange={(v) => setReplaceOld(v === true)} className="border-white" /> Already has {garment.photos} picture{garment.photos === 1 ? "" : "s"} — {replaceOld ? "replace them with the new ones" : "keep them and add the new ones"}</label>
              )}
            </div>
          )}
          {mode === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              <ScanLine className="size-12 opacity-80" />
              <Button type="button" size="lg" className="h-14 px-8 text-lg" onClick={startScan}><Camera className="size-5" /> Open camera to scan</Button>
              <p className="text-xs text-white/70">Scan the barcode, then the same camera takes the pictures.</p>
            </div>
          )}
        </div>
        <CardContent className="space-y-3 p-3">
          {mode === "shoot" && (
            <>
              <div className="flex items-center gap-2">
                <Button type="button" size="lg" className="h-16 flex-1 text-lg" onClick={snap} disabled={shots.length >= MAX_SHOTS}><Camera className="size-6" /> {shots.length >= MAX_SHOTS ? `${MAX_SHOTS} is the limit` : `Take picture ${shots.length + 1}`}</Button>
                <Button type="button" variant="outline" className="h-16" onClick={() => fileRef.current?.click()} title="Use the phone's own camera app for one shot"><Camera className="size-4" /> App</Button>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onNative} />
              </div>
              {camInfo && <p className="text-[11px] text-muted-foreground">Camera stream {camInfo} · each kept shot is cropped square and sized to 2048 px for Shopify, under 1 MB</p>}
              {shots.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {shots.map((s, i) => (
                    <button key={s.id} type="button" onClick={() => setShots((all) => all.map((x) => (x.id === s.id ? { ...x, keep: !x.keep } : x)))} className={cn("relative aspect-square overflow-hidden rounded-md border-2", s.keep ? "border-green-600" : "border-transparent opacity-40")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt={`Shot ${i + 1}`} className="h-full w-full object-cover" />
                      <span className={cn("absolute left-1 top-1 rounded-full p-0.5 text-white", s.keep ? "bg-green-600" : "bg-neutral-500")}>{s.keep ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}{i === 0 && s.keep ? " · cut-out" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-xs"><Checkbox checked={autoCut} onCheckedChange={(v) => setAuto(v === true)} /> Remove the background from the first kept picture (soft shadow on white)</label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="h-12" onClick={startScan}><RefreshCw className="size-4" /> Rescan</Button>
                <Button type="button" className="h-12 flex-1 text-base" disabled={!kept} onClick={save}><Check className="size-5" /> Save {kept || ""} picture{kept === 1 ? "" : "s"} &amp; next garment</Button>
              </div>
            </>
          )}
          {mode === "scan" && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { scanStop.current?.(); void pick(manual.trim().toUpperCase()); setManual(""); } }}>
              <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…or type the SKU" className="h-11 font-mono" autoComplete="off" />
              <Button type="submit" variant="outline" className="h-11">Open</Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ list */}
      {data && (() => {
        const all = [...data.waiting, ...data.done];
        const rows = listFilter === "none" ? data.waiting : listFilter === "done" ? data.done : all;
        const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>Online garments</span>
                <span className="flex gap-1 rounded-md border p-0.5 text-xs font-normal">
                  {([["all", `All · ${all.length}`], ["none", `No pictures · ${data.waiting.length}`], ["done", `Done · ${data.done.length}`]] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setListFilter(k)} className={cn("rounded px-2 py-1", listFilter === k ? "bg-foreground text-background" : "hover:bg-muted")}>{label}</button>
                  ))}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">{listFilter === "none" ? "Every online garment has pictures." : "Nothing here yet."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="pb-2 pr-2">SKU</th><th className="pb-2 pr-2">Garment</th><th className="pb-2 pr-2">Brand</th><th className="pb-2 pr-2 text-right">Pictures</th><th className="pb-2 pr-2">Status</th>{data.sees_names && <th className="pb-2 pr-2">Photographer</th>}<th className="pb-2"></th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r) => {
                        const none = r.photos === 0;
                        return (
                          <tr key={r.sku} className={cn(none && "bg-amber-50/60 dark:bg-amber-950/20")}>
                            <td className="py-1.5 pr-2 font-mono text-xs">{r.sku}</td>
                            <td className="py-1.5 pr-2">{r.sub_category}{r.size ? <span className="text-muted-foreground"> · {r.size}</span> : null}</td>
                            <td className="py-1.5 pr-2">{r.brand ?? "—"}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{r.photos}{r.cutouts ? <span className="text-xs text-muted-foreground"> +{r.cutouts} cut-out</span> : null}</td>
                            <td className="py-1.5 pr-2">
                              {none ? <span className="rounded-full border border-amber-500 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">None taken</span>
                                : r.cutouts === 0 && autoCut ? <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Cut-out pending</span>
                                : <span className="rounded-full border border-green-600 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">Done</span>}
                            </td>
                            {data.sees_names && <td className="py-1.5 pr-2 text-xs text-muted-foreground">{r.photographer ?? "—"}{r.photographed_at ? <span className="block">{when(r.photographed_at)}</span> : null}</td>}
                            <td className="py-1.5 text-right">
                              <span className="flex justify-end gap-1">
                                {none
                                  ? <Button type="button" size="sm" className="h-8" onClick={() => { scanStop.current?.(); void pick(r.sku); }}>Shoot</Button>
                                  : <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => { scanStop.current?.(); void pick(r.sku, true); }}>Retake</Button>}
                                <Button asChild type="button" size="sm" variant="ghost" className="h-8"><Link href={`/photos/${encodeURIComponent(r.sku)}`}>Review</Link></Button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
