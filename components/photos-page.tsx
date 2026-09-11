"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, RefreshCw, RotateCw, ScanLine, Search, Star, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { applyAdjust, cutoutOnWhite, NO_ADJUST, squareForShopify, type Adjust } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * The photography station on an iPhone, laid out the way marketplace seller
 * apps do it:
 *
 *   Home      — who is signed in, today's progress, one big "New garment"
 *               button, search/scan for a retake, the pending list.
 *   Shoot     — the camera reads the tag, then becomes the shutter: up to
 *               six shots, thumbnails as you go.
 *   Review    — each picture full screen: brightness, contrast, rotate,
 *               cover, discard; apply the same look to all; then Save.
 *
 * Saving runs in the background (square, 2048 px, under 1 MB; the cover
 * shot cut out on white with a soft shadow) while the next garment is scanned.
 */

type Row = { sku: string; brand: string | null; size: string | null; grade: string; tagged_at: string; online_status: string | null; sub_category: string; photos: number; cutouts: number; photographed_at: string | null; photographer: string | null };
type Me = { name: string; role: string; today: number; target: number; pct: number };
type Garment = { sku: string; brand: string | null; sub_category: string; size_label: string | null; grade: string; channel: string; photos: number; paths: string[] };
type Shot = { id: number; blob: Blob; url: string; keep: boolean; adjust: Adjust };
type Job = { sku: string; total: number; done: number; cutout: "pending" | "working" | "done" | "skipped" | "failed"; error?: string; cutoutUrl?: string };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const MAX_SHOTS = 6;
const cssFilter = (a: Adjust) => `brightness(${a.brightness}) contrast(${a.contrast})`;

export function PhotosPage() {
  const [data, setData] = useState<{ waiting: Row[]; done: Row[]; total_online: number; me: Me; sees_names?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"home" | "scan" | "shoot" | "review">("home");
  const [garment, setGarment] = useState<Garment | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<"none" | "done" | "all">("none");
  const [replaceOld, setReplaceOld] = useState(false);
  const [camInfo, setCamInfo] = useState<string | null>(null);
  const [autoCut, setAutoCut] = useState(true);
  const [flash, setFlash] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanStop = useRef<(() => void) | null>(null);
  const shotId = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/photos/queue");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the list."); }
  }, []);
  useEffect(() => { void load(); try { setAutoCut(localStorage.getItem("khz_autocut") !== "off"); } catch { /* fine */ } }, [load]);
  function setAuto(v: boolean) { setAutoCut(v); try { localStorage.setItem("khz_autocut", v ? "on" : "off"); } catch { /* fine */ } }

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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 4096 } } });
    streamRef.current = stream;
    // The element is always mounted (hidden on the home screen), but give React a frame anyway.
    let v = videoRef.current;
    for (let i = 0; i < 10 && !v; i++) { await new Promise((r) => requestAnimationFrame(() => r(null))); v = videoRef.current; }
    if (!v) throw new Error("camera view not ready — try again");
    v.srcObject = stream;
    try { await v.play(); } catch { /* iOS may need the tap that already happened; the stream is attached either way */ }
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

  function discardShots() { shots.forEach((s) => URL.revokeObjectURL(s.url)); setShots([]); }

  async function startScan() {
    setError(null);
    setGarment(null);
    discardShots();
    try {
      await openCamera();
      setMode("scan");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoElement(videoRef.current!, (result) => {
        const text = result?.getText()?.trim().toUpperCase();
        if (text && /^KHZ-/.test(text)) { controls.stop(); scanStop.current = null; void pick(text); }
      });
      scanStop.current = () => controls.stop();
    } catch (e) {
      setError(e instanceof Error ? `Camera: ${e.message}. On iPhone, allow the camera for this site (Settings → Safari → Camera).` : "Camera unavailable.");
      setMode("home");
    }
  }

  function goHome() { closeCamera(); discardShots(); setGarment(null); setMode("home"); void load(); }

  async function pick(sku: string, retake = false) {
    setError(null);
    const r = await fetch(`/api/items/${encodeURIComponent(sku)}`);
    const j = await r.json();
    if (!r.ok) { setError(j.error ?? `No garment ${sku}.`); if (mode === "scan") await startScan(); return; }
    const it = j.item ?? j;
    const paths = ((it.photos ?? []) as { path: string }[]).map((p) => p.path);
    setGarment({ sku: it.sku, brand: it.brand ?? null, sub_category: it.sub_category ?? "", size_label: it.size_label, grade: it.grade ?? it.grade_code, channel: it.channel, photos: paths.length, paths });
    setReplaceOld(retake && paths.length > 0);
    discardShots();
    try { await openCamera(); setMode("shoot"); } catch (e) { setError(e instanceof Error ? e.message : "Camera unavailable."); setMode("home"); }
  }

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || shots.length >= MAX_SHOTS) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setFlash(true); setTimeout(() => setFlash(false), 120);
    c.toBlob((b) => { if (!b) return; const id = ++shotId.current; setShots((s) => [...s, { id, blob: b, url: URL.createObjectURL(b), keep: true, adjust: NO_ADJUST }]); }, "image/jpeg", 0.95);
  }
  function onNative(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files.slice(0, MAX_SHOTS - shots.length)) { const id = ++shotId.current; setShots((s) => [...s, { id, blob: f, url: URL.createObjectURL(f), keep: true, adjust: NO_ADJUST }]); }
  }

  /* ------------------------------------------------------------ review */

  const setShot = (id: number, patch: Partial<Shot> | ((s: Shot) => Partial<Shot>)) => setShots((all) => all.map((s) => (s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)));
  const applyToAll = (a: Adjust) => setShots((all) => all.map((s) => ({ ...s, adjust: { ...a, rotate: s.adjust.rotate } })));
  const makeCover = (id: number) => setShots((all) => { const i = all.findIndex((s) => s.id === id); if (i <= 0) return all; const c = [...all]; const [s] = c.splice(i, 1); return [s, ...c]; });

  /* ------------------------------------------------------- background save */

  async function upload(sku: string, file: Blob, kind: "original" | "cutout"): Promise<{ url: string }> {
    const fd = new FormData();
    fd.append("sku", sku); fd.append("kind", kind); fd.append("file", file, kind === "cutout" ? "cutout.jpg" : "photo.jpg");
    const res = await fetch("/api/photos", { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Upload failed.");
    return j.photo;
  }

  function save() {
    if (!garment) return;
    const kept = shots.filter((s) => s.keep);
    if (!kept.length) return;
    const sku = garment.sku;
    const wantCut = autoCut;
    const oldPaths = replaceOld ? garment.paths : [];
    const job: Job = { sku, total: kept.length, done: 0, cutout: wantCut ? "pending" : "skipped" };
    setJobs((j) => [job, ...j.filter((x) => x.sku !== sku)].slice(0, 12));
    const work = kept.map((s) => ({ blob: s.blob, adjust: s.adjust }));
    void (async () => {
      const update = (patch: Partial<Job>) => setJobs((j) => j.map((x) => (x.sku === sku ? { ...x, ...patch } : x)));
      let cover: Blob | null = null;
      try {
        for (const path of oldPaths) await fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, path }) });
        for (let i = 0; i < work.length; i++) {
          const square = await squareForShopify(await applyAdjust(work[i].blob, work[i].adjust), 2048, 1024 * 1024);
          if (!cover) cover = square;
          await upload(sku, square, "original");
          update({ done: i + 1 });
        }
      } catch (e) { update({ error: e instanceof Error ? e.message : "Upload failed.", cutout: "failed" }); return; }
      if (wantCut && cover) {
        update({ cutout: "working" });
        try {
          const { removeBackground } = await import("@imgly/background-removal");
          const png = await removeBackground(cover, { output: { format: "image/png", quality: 0.9 } });
          const shadowed = await cutoutOnWhite(png, 2048);
          const small = shadowed.size > 1024 * 1024 ? await squareForShopify(shadowed, 2048, 1024 * 1024) : shadowed;
          const photo = await upload(sku, small, "cutout");
          update({ cutout: "done", cutoutUrl: photo.url });
        } catch (e) { update({ cutout: "failed", error: e instanceof Error ? e.message : "Background removal failed." }); }
      }
      void load();
    })();
    discardShots();
    setGarment(null);
    void startScan();
  }

  const kept = shots.filter((s) => s.keep);
  const me = data?.me;
  const current = shots[reviewIdx];

  /* ------------------------------------------------------------ views */

  const Progress = me && (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
      <div>
        <div className="text-sm font-semibold">{me.name} <span className="font-normal capitalize text-muted-foreground">· {me.role.replace("_", " ")}</span></div>
        <div className="text-xs text-muted-foreground">{me.today} of {me.target} garments today · {Math.max(0, me.target - me.today)} to go</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2 w-28 rounded bg-muted"><div className={cn("h-2 rounded", me.pct >= 100 ? "bg-green-600" : "bg-foreground/70")} style={{ width: `${Math.min(100, me.pct)}%` }} /></div>
        <div className={cn("text-xl font-bold tabular-nums", me.pct >= 100 && "text-green-700 dark:text-green-400")}>{me.pct}%</div>
      </div>
    </div>
  );

  const Jobs = jobs.length > 0 && (
    <ul className="space-y-1 text-xs">
      {jobs.slice(0, 4).map((j) => (
        <li key={j.sku} className={cn("flex flex-wrap items-center gap-2 rounded-md border px-2 py-1", j.error ? "border-red-400" : j.done < j.total || j.cutout === "working" || j.cutout === "pending" ? "border-amber-400" : "border-green-500")}>
          <span className="font-mono">{j.sku}</span>
          <span className="text-muted-foreground">{j.done}/{j.total} uploaded</span>
          {j.cutout === "pending" && <span className="text-muted-foreground">· cut-out queued</span>}
          {j.cutout === "working" && <span className="text-amber-700 dark:text-amber-400">· removing background…</span>}
          {j.cutout === "done" && <span className="text-green-700 dark:text-green-400">· cut-out ready</span>}
          {j.cutout === "failed" && <span className="text-red-700 dark:text-red-400">· {j.error ?? "cut-out failed"}</span>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {j.cutoutUrl && <img src={j.cutoutUrl} alt="" className="ml-auto h-8 w-8 rounded border object-contain" />}
          <Link href={`/photos/${encodeURIComponent(j.sku)}`} className="ml-auto underline">check</Link>
        </li>
      ))}
    </ul>
  );

  // ---- Review: one picture, full screen, layered over the page so the camera stays mounted
  const Review = mode === "review" && current && (() => {
    const a = current.adjust;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
        <div className="flex items-center justify-between px-3 py-2 text-sm">
          <button type="button" onClick={() => setMode("shoot")} className="flex items-center gap-1"><ChevronLeft className="size-5" /> Back</button>
          <span>Picture {reviewIdx + 1} of {shots.length}{reviewIdx === 0 && current.keep ? " · cover" : ""}{!current.keep ? " · discarded" : ""}</span>
          <button type="button" onClick={save} disabled={!kept.length} className="rounded bg-white px-3 py-1 font-semibold text-black disabled:opacity-40">Save {kept.length}</button>
        </div>
        <div className="relative flex-1 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt="" className={cn("h-full w-full object-contain transition-[filter]", !current.keep && "opacity-30")} style={{ filter: cssFilter(a), transform: `rotate(${a.rotate}deg)` }} />
          <button type="button" onClick={() => setReviewIdx((i) => Math.max(0, i - 1))} disabled={reviewIdx === 0} className="absolute left-0 top-0 h-full w-1/5 disabled:opacity-0" aria-label="Previous" />
          <button type="button" onClick={() => setReviewIdx((i) => Math.min(shots.length - 1, i + 1))} disabled={reviewIdx === shots.length - 1} className="absolute right-0 top-0 h-full w-1/5 disabled:opacity-0" aria-label="Next" />
          {reviewIdx > 0 && <ChevronLeft className="pointer-events-none absolute left-2 top-1/2 size-8 -translate-y-1/2 opacity-70" />}
          {reviewIdx < shots.length - 1 && <ChevronRight className="pointer-events-none absolute right-2 top-1/2 size-8 -translate-y-1/2 opacity-70" />}
        </div>
        <div className="space-y-3 bg-neutral-900 px-4 pb-6 pt-3">
          <label className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-xs">Brightness<input type="range" min="0.6" max="1.4" step="0.02" value={a.brightness} onChange={(e) => setShot(current.id, (s) => ({ adjust: { ...s.adjust, brightness: Number(e.target.value) } }))} className="accent-white" /><span className="text-right tabular-nums">{Math.round((a.brightness - 1) * 100)}</span></label>
          <label className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-xs">Contrast<input type="range" min="0.6" max="1.4" step="0.02" value={a.contrast} onChange={(e) => setShot(current.id, (s) => ({ adjust: { ...s.adjust, contrast: Number(e.target.value) } }))} className="accent-white" /><span className="text-right tabular-nums">{Math.round((a.contrast - 1) * 100)}</span></label>
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => setShot(current.id, (s) => ({ adjust: { ...s.adjust, rotate: ((s.adjust.rotate + 90) % 360) as Adjust["rotate"] } }))} className="flex items-center gap-1 rounded border border-white/40 px-3 py-2"><RotateCw className="size-4" /> Rotate</button>
            <button type="button" onClick={() => setShot(current.id, { adjust: { ...NO_ADJUST, rotate: a.rotate } })} className="rounded border border-white/40 px-3 py-2">Reset</button>
            <button type="button" onClick={() => applyToAll(a)} className="rounded border border-white/40 px-3 py-2">Apply to all pictures</button>
            {reviewIdx > 0 && current.keep && <button type="button" onClick={() => { makeCover(current.id); setReviewIdx(0); }} className="flex items-center gap-1 rounded border border-white/40 px-3 py-2"><Star className="size-4" /> Make cover</button>}
            <button type="button" onClick={() => setShot(current.id, (s) => ({ keep: !s.keep }))} className={cn("ml-auto flex items-center gap-1 rounded px-3 py-2", current.keep ? "border border-red-400 text-red-300" : "bg-white text-black")}>{current.keep ? <><Trash2 className="size-4" /> Discard</> : <><Check className="size-4" /> Keep</>}</button>
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {shots.map((s, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={s.id} src={s.url} alt="" onClick={() => setReviewIdx(i)} className={cn("h-12 w-12 shrink-0 cursor-pointer rounded object-cover", i === reviewIdx ? "ring-2 ring-white" : "opacity-60", !s.keep && "opacity-20")} style={{ filter: cssFilter(s.adjust) }} />
            ))}
          </div>
          <p className="text-[11px] text-neutral-400">The cover is picture 1: it gets the background removed. Brightness and contrast are baked in on save; every picture is cropped square and sized for Shopify.</p>
        </div>
      </div>
    );
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {Review}
      {Progress}
      {Jobs}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* ---- Home */}
      {mode === "home" && data && (
        <>
          <Button type="button" size="lg" className="h-20 w-full text-xl" onClick={startScan}><Camera className="size-7" /> New garment · scan its tag</Button>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const s = search.trim().toUpperCase(); if (s) { void pick(s, true); setSearch(""); } }}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a SKU to retake — type it, or scan with a reader" className="h-12 pl-9 font-mono" autoComplete="off" autoCapitalize="characters" />
            </div>
            <Button type="submit" variant="outline" className="h-12">Open</Button>
          </form>
          {(() => {
            const all = [...data.waiting, ...data.done];
            const rows = listFilter === "none" ? data.waiting : listFilter === "done" ? data.done : all;
            const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>Garments</span>
                    <span className="flex gap-1 rounded-md border p-0.5 text-xs font-normal">
                      {([["none", `Pending · ${data.waiting.length}`], ["done", `Done · ${data.done.length}`], ["all", `All · ${all.length}`]] as const).map(([k, label]) => (
                        <button key={k} type="button" onClick={() => setListFilter(k)} className={cn("rounded px-2 py-1", listFilter === k ? "bg-foreground text-background" : "hover:bg-muted")}>{label}</button>
                      ))}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {rows.length === 0 ? (
                    <p className="py-3 text-center text-sm text-muted-foreground">{listFilter === "none" ? "Nothing pending — every online garment has pictures." : "Nothing here yet."}</p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {rows.map((r) => {
                        const none = r.photos === 0;
                        return (
                          <li key={r.sku} className={cn("flex items-center gap-3 py-2", none && "bg-amber-50/60 dark:bg-amber-950/20")}>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2"><span className="font-mono text-xs">{r.sku}</span>
                                {none ? <span className="rounded-full border border-amber-500 px-2 text-[11px] text-amber-700 dark:text-amber-300">None taken</span>
                                  : r.cutouts === 0 && autoCut ? <span className="rounded-full border px-2 text-[11px] text-muted-foreground">{r.photos} pic{r.photos === 1 ? "" : "s"} · cut-out pending</span>
                                  : <span className="rounded-full border border-green-600 px-2 text-[11px] text-green-700 dark:text-green-400">{r.photos} pic{r.photos === 1 ? "" : "s"} · done</span>}
                              </div>
                              <div className="truncate">{r.brand ?? "—"} · {r.sub_category}{r.size ? ` · ${r.size}` : ""} · {GRADE[r.grade] ?? r.grade}</div>
                              {data.sees_names && r.photographer && <div className="text-xs text-muted-foreground">{r.photographer} · {when(r.photographed_at)}</div>}
                            </div>
                            {none
                              ? <Button type="button" size="sm" className="h-9 shrink-0" onClick={() => void pick(r.sku)}>Shoot</Button>
                              : <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={() => void pick(r.sku, true)}>Retake</Button>}
                            <Button asChild type="button" size="sm" variant="ghost" className="h-9 shrink-0 px-2"><Link href={`/photos/${encodeURIComponent(r.sku)}`}>Review</Link></Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}

      {/* ---- Scan / Shoot — always mounted so the camera stream has somewhere to go */}
      <Card className={cn("overflow-hidden", (mode === "home" || mode === "review") && "hidden")}>
          <div className="relative aspect-square bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            {flash && <div className="absolute inset-0 bg-white/80" />}
            {mode === "scan" && (
              <>
                <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-white/80" />
                <div className="absolute bottom-3 left-0 right-0 text-center text-sm font-medium text-white drop-shadow">Point at the barcode on the tag</div>
              </>
            )}
            <button type="button" onClick={goHome} className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white" aria-label="Close"><X className="size-5" /></button>
          </div>
          <CardContent className="space-y-3 p-3">
            {mode === "scan" && (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (search.trim()) { scanStop.current?.(); void pick(search.trim().toUpperCase()); setSearch(""); } }}>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="…or type the SKU" className="h-11 font-mono" autoComplete="off" autoCapitalize="characters" />
                <Button type="submit" variant="outline" className="h-11">Open</Button>
              </form>
            )}
            {mode === "shoot" && garment && (
              <div className="rounded-md border px-3 py-2">
                <div className="font-mono text-xs text-muted-foreground">{garment.sku}{garment.channel !== "online" ? " · outlet stock" : ""}</div>
                <div className="text-sm font-semibold">{garment.brand ?? "—"} · {garment.sub_category}{garment.size_label ? ` · ${garment.size_label}` : ""} · {GRADE[garment.grade] ?? garment.grade}</div>
                {garment.photos > 0 && (
                  <label className="mt-1 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300"><Checkbox checked={replaceOld} onCheckedChange={(v) => setReplaceOld(v === true)} /> Already has {garment.photos} picture{garment.photos === 1 ? "" : "s"} — {replaceOld ? "replace them with the new ones" : "keep them and add the new ones"}</label>
                )}
              </div>
            )}
            {mode === "shoot" && (
              <>
                <div className="flex items-center gap-2">
                  <Button type="button" size="lg" className="h-16 flex-1 text-lg" onClick={snap} disabled={shots.length >= MAX_SHOTS}><Camera className="size-6" /> {shots.length >= MAX_SHOTS ? `${MAX_SHOTS} is the limit` : `Take picture ${shots.length + 1}`}</Button>
                  <Button type="button" variant="outline" className="h-16" onClick={() => fileRef.current?.click()} title="Use the phone's own camera app for one shot"><Camera className="size-4" /> App</Button>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onNative} />
                </div>
                {camInfo && <p className="text-[11px] text-muted-foreground">Camera {camInfo} · saved square at 2048 px for Shopify, under 1 MB</p>}
                {shots.length > 0 && <p className="text-xs text-muted-foreground">Tap a picture to see it full screen and adjust brightness, contrast or rotation.</p>}
                {shots.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {shots.map((s, i) => (
                      <button key={s.id} type="button" onClick={() => { setReviewIdx(i); setMode("review"); }} className={cn("relative aspect-square overflow-hidden rounded-md border-2", s.keep ? "border-green-600" : "border-transparent opacity-40")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt={`Shot ${i + 1}`} className="h-full w-full object-cover" style={{ filter: cssFilter(s.adjust), transform: `rotate(${s.adjust.rotate}deg)` }} />
                        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}{i === 0 && s.keep ? " · cover" : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={autoCut} onCheckedChange={(v) => setAuto(v === true)} /> Remove the background from the cover picture (soft shadow on white)</label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-12" onClick={startScan}><RefreshCw className="size-4" /> Rescan</Button>
                  <Button type="button" variant="outline" className="h-12" disabled={!shots.length} onClick={() => { setReviewIdx(0); setMode("review"); }}>Review &amp; adjust</Button>
                  <Button type="button" className="h-12 flex-1 text-base" disabled={!kept.length} onClick={save}><Check className="size-5" /> Save {kept.length || ""} &amp; next</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      {mode !== "home" && <Button type="button" variant="ghost" className="w-full" onClick={goHome}><ScanLine className="size-4" /> Back to the list</Button>}
    </div>
  );
}
