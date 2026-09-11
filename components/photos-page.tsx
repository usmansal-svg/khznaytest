"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, LogOut, RefreshCw, RotateCw, ScanLine, Search, Star, Trash2, UserRound, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useHoldDrag } from "@/lib/hold-drag";
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
type Garment = { sku: string; brand: string | null; sub_category: string; size_label: string | null; grade: string; channel: string; photos: number; cutoutPaths: string[] };
type Shot = { id: number; blob: Blob | null; url: string; keep: boolean; adjust: Adjust; existing?: { path: string } };
type Job = { sku: string; total: number; done: number; cutout: "pending" | "working" | "done" | "skipped" | "failed"; error?: string; cutoutUrl?: string };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const MAX_SHOTS = 6;
const cssFilter = (a: Adjust) => `brightness(${a.brightness}) contrast(${a.contrast})`;

export function PhotosPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [profile, setProfile] = useState(false);
  const [pf, setPf] = useState({ name: "", current: "", next: "", busy: false, msg: null as { ok: boolean; text: string } | null });
  const [data, setData] = useState<{ waiting: Row[]; done: Row[]; total_online: number; me: Me; sees_names?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"home" | "scan" | "shoot" | "review">("home");
  const [retaking, setRetaking] = useState(false);
  const [garment, setGarment] = useState<Garment | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<"none" | "done" | "all">("all");
  const touchX = useRef<number | null>(null);
  // Press-and-hold drag to reorder the thumbnails; the ghost follows the thumb.
  const [camOn, setCamOn] = useState(false);
  const drag = useHoldDrag<number>(
    shots.map((x) => x.id),
    (from, to) => setShots((all) => { const a = all.findIndex((x) => x.id === from); const b = all.findIndex((x) => x.id === to); if (a < 0 || b < 0) return all; const c = [...all]; const [m] = c.splice(a, 1); c.splice(b, 0, m); return c; }),
  );
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
  // "Add more pictures" on the review page lands here with ?sku=… and goes straight to the camera.
  const wanted = params.get("sku");
  useEffect(() => {
    if (!wanted) return;
    router.replace("/photos");
    void pick(wanted.toUpperCase(), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
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
    setCamOn(true);
    return stream;
  }
  function closeCamera() {
    scanStop.current?.();
    scanStop.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }
  useEffect(() => () => closeCamera(), []);

  function discardShots() { shots.forEach((s) => { if (s.blob) URL.revokeObjectURL(s.url); }); setShots([]); }

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
    const photos = (it.photos ?? []) as { path: string; url: string; kind: string }[];
    const originals = photos.filter((p) => p.kind !== "cutout");
    setGarment({ sku: it.sku, brand: it.brand ?? null, sub_category: it.sub_category ?? "", size_label: it.size_label, grade: it.grade ?? it.grade_code, channel: it.channel, photos: originals.length, cutoutPaths: photos.filter((p) => p.kind === "cutout").map((p) => p.path) });
    discardShots();
    setRetaking(retake || originals.length > 0);
    // A reshoot starts from what is already there: every earlier picture can be kept, adjusted, discarded or joined by new ones.
    if (originals.length) setShots(originals.map((p) => ({ id: ++shotId.current, blob: null, url: p.url, keep: true, adjust: NO_ADJUST, existing: { path: p.path } })));
    // The iPhone only opens the camera on a tap: if one is already running we
    // keep it; otherwise the shoot screen shows an "Open camera" button.
    setMode("shoot");
  }

  const keptCount = shots.filter((s) => s.keep).length;
  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || keptCount >= MAX_SHOTS) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setFlash(true); setTimeout(() => setFlash(false), 120);
    c.toBlob((b) => { if (!b) return; const id = ++shotId.current; setShots((s) => [...s, { id, blob: b, url: URL.createObjectURL(b), keep: true, adjust: NO_ADJUST }]); }, "image/jpeg", 0.95);
  }
  function onNative(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files.slice(0, Math.max(0, MAX_SHOTS - keptCount))) { const id = ++shotId.current; setShots((s) => [...s, { id, blob: f, url: URL.createObjectURL(f), keep: true, adjust: NO_ADJUST }]); }
  }

  /* ------------------------------------------------------------ review */

  const setShot = (id: number, patch: Partial<Shot> | ((s: Shot) => Partial<Shot>)) => setShots((all) => all.map((s) => (s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)));
  const applyToAll = (a: Adjust) => setShots((all) => all.map((s) => ({ ...s, adjust: { ...a, rotate: s.adjust.rotate } })));

  /* ------------------------------------------------------- background save */

  async function upload(sku: string, file: Blob, kind: "original" | "cutout"): Promise<{ url: string; path: string }> {
    const fd = new FormData();
    fd.append("sku", sku); fd.append("kind", kind); fd.append("file", file, kind === "cutout" ? "cutout.jpg" : "photo.jpg");
    const res = await fetch("/api/photos", { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Upload failed.");
    return j.photo;
  }

  /** Save asks for the cover first when there is a choice to make. */
  function requestSave() {
    const kept = shots.filter((s) => s.keep);
    if (!kept.length) return;
    save(kept[0].id);
  }

  function save(chosenCover: number) {
    if (!garment) return;
    const kept = shots.filter((s) => s.keep);
    if (!kept.length) return;
    const sku = garment.sku;
    const wantCut = autoCut;
    const discarded = shots.filter((s) => !s.keep && s.existing).map((s) => s.existing!.path);
    const changed = kept.filter((s) => s.existing && (s.adjust.brightness !== 1 || s.adjust.contrast !== 1 || s.adjust.rotate !== 0));
    const fresh = kept.filter((s) => !s.existing);
    const total = fresh.length + changed.length;
    const job: Job = { sku, total, done: 0, cutout: wantCut ? "pending" : "skipped" };
    setJobs((j) => [job, ...j.filter((x) => x.sku !== sku)].slice(0, 12));
    const coverShot = kept.find((s) => s.id === chosenCover) ?? kept[0];
    const oldCutouts = garment.cutoutPaths;
    const work = kept.map((s) => ({ id: s.id, blob: s.blob, url: s.url, adjust: s.adjust, existing: s.existing, isCover: s.id === coverShot.id }));
    void (async () => {
      const update = (patch: Partial<Job>) => setJobs((j) => j.map((x) => (x.sku === sku ? { ...x, ...patch } : x)));
      const del = (path: string) => fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, path }) });
      let cover: Blob | null = null;
      let done = 0;
      const uploaded: string[] = [];
      try {
        for (const path of discarded) await del(path);
        for (const w of work) {
          const edited = w.adjust.brightness !== 1 || w.adjust.contrast !== 1 || w.adjust.rotate !== 0;
          if (w.existing && !edited) {
            if (w.isCover) cover = await (await fetch(w.url)).blob();
            continue; // untouched earlier picture stays as it is
          }
          const source = w.blob ?? (await (await fetch(w.url)).blob());
          const square = await squareForShopify(await applyAdjust(source, w.adjust), 2048, 1024 * 1024);
          if (w.isCover) cover = square;
          const ph = await upload(sku, square, "original");
          uploaded.push(ph.path);
          if (w.existing) await del(w.existing.path); // the edited version replaces it
          update({ done: ++done });
        }
      } catch (e) { update({ error: e instanceof Error ? e.message : "Upload failed.", cutout: "failed" }); return; }
      // The order on screen is the order on Shopify.
      try {
        const order: string[] = [];
        for (const w of work) order.push(w.existing && !(w.adjust.brightness !== 1 || w.adjust.contrast !== 1 || w.adjust.rotate !== 0) ? w.existing.path : (uploaded.shift() ?? ""));
        await fetch("/api/photos", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, order: order.filter(Boolean) }) });
      } catch { /* order is cosmetic; the pictures are safe */ }
      // A new cover means a new cut-out; the old cut-outs go.
      if (wantCut && cover) for (const path of oldCutouts) await del(path);
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
    setRetaking(false);
    void startScan();
  }

  const kept = shots.filter((s) => s.keep);
  // The order is the order on Shopify, and the first kept picture is the cover.
  const coverId = kept[0]?.id ?? null;
  const toFront = (id: number) => setShots((all) => { const i = all.findIndex((s) => s.id === id); if (i <= 0) return all; const c = [...all]; const [x] = c.splice(i, 1); return [x, ...c]; });
  const me = data?.me;
  const current = shots[reviewIdx];

  /* ------------------------------------------------------------ views */

  async function logout() {
    closeCamera();
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  async function saveProfile() {
    setPf((p) => ({ ...p, busy: true, msg: null }));
    try {
      const res = await fetch("/api/auth/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ current_pin: pf.current, name: pf.name.trim() || undefined, new_pin: pf.next || undefined }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not save.");
      setPf((p) => ({ ...p, busy: false, current: "", next: "", msg: { ok: true, text: "Saved." } }));
      void load();
    } catch (e) { setPf((p) => ({ ...p, busy: false, msg: { ok: false, text: e instanceof Error ? e.message : "Could not save." } })); }
  }

  // Header: wordmark (home), the day's progress as a ring, profile / sign out.
  const pct = me ? Math.min(100, me.pct) : 0;
  const ring = 2 * Math.PI * 34;
  const Header = (
    <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-neutral-900 to-neutral-700 text-white shadow-md dark:from-neutral-800 dark:to-neutral-950">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="rounded bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest">Photography</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { setPf((p) => ({ ...p, name: me?.name ?? "", msg: null })); setProfile(true); }} className="rounded-full p-2 hover:bg-white/10" aria-label="Profile"><UserRound className="size-5" /></button>
          <button type="button" onClick={logout} className="rounded-full p-2 hover:bg-white/10" aria-label="Sign out"><LogOut className="size-5" /></button>
        </div>
      </div>
      {me && (
        <div className="flex items-center gap-4 px-4 pb-4 pt-2">
          <div className="relative size-24 shrink-0">
            <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
              <circle cx="40" cy="40" r="34" fill="none" stroke={pct >= 100 ? "#22c55e" : "#f59e0b"} strokeWidth="8" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-black tabular-nums leading-none">{me.pct}%</span><span className="text-[10px] text-white/60">today</span></div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-widest text-white/60">{new Date().toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "short" })}</div>
            <div className="truncate text-2xl font-bold leading-tight">{me.name}</div>
            <div className="mt-1 text-sm text-white/80"><span className="text-lg font-semibold text-white">{me.today}</span> of {me.target} garments{me.today >= me.target ? " · target met 🎉" : ` · ${me.target - me.today} to go`}</div>
          </div>
        </div>
      )}
    </div>
  );

  const Profile = profile && (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={() => setProfile(false)}>
      <div className="rounded-t-2xl bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Your profile</h2>
        <p className="mb-3 text-sm text-muted-foreground">Change your name or PIN. Your current PIN is needed for either.</p>
        <div className="grid gap-3">
          <div className="grid gap-1"><label className="text-xs font-medium" htmlFor="pf-name">Name</label><Input id="pf-name" value={pf.name} onChange={(e) => setPf((p) => ({ ...p, name: e.target.value }))} className="h-11" /></div>
          <div className="grid gap-1"><label className="text-xs font-medium" htmlFor="pf-cur">Current PIN</label><Input id="pf-cur" type="password" inputMode="numeric" value={pf.current} onChange={(e) => setPf((p) => ({ ...p, current: e.target.value.replace(/\D/g, "").slice(0, 6) }))} className="h-11 font-mono" /></div>
          <div className="grid gap-1"><label className="text-xs font-medium" htmlFor="pf-new">New PIN <span className="font-normal text-muted-foreground">· leave empty to keep it</span></label><Input id="pf-new" type="password" inputMode="numeric" value={pf.next} onChange={(e) => setPf((p) => ({ ...p, next: e.target.value.replace(/\D/g, "").slice(0, 6) }))} className="h-11 font-mono" placeholder="4–6 digits" /></div>
          {pf.msg && <p className={cn("text-sm", pf.msg.ok ? "text-green-700 dark:text-green-400" : "text-destructive")}>{pf.msg.text}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={() => setProfile(false)}>Close</Button>
            <Button type="button" className="h-12 flex-1" disabled={pf.busy || pf.current.length < 4} onClick={saveProfile}>{pf.busy ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="ghost" className="h-12" onClick={logout}><LogOut className="size-4" /> Sign out</Button>
          </div>
        </div>
      </div>
    </div>
  );


  // ---- Review: one picture, full screen, layered over the page so the camera stays mounted
  const Review = mode === "review" && current && (() => {
    const a = current.adjust;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
        <div className="flex items-center justify-between px-3 py-2 text-sm">
          <button type="button" onClick={() => setMode("shoot")} className="flex items-center gap-1"><ChevronLeft className="size-5" /> Back</button>
          <span>Picture {reviewIdx + 1} of {shots.length}{!current.keep ? " · discarded" : ""}</span>
          <button type="button" onClick={requestSave} disabled={!kept.length} className="rounded bg-white px-3 py-1 font-semibold text-black disabled:opacity-40">Save {kept.length}</button>
        </div>
        <div
          className="relative flex-1 overflow-hidden"
          onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
          onTouchEnd={(e) => {
            const x0 = touchX.current; touchX.current = null;
            const x1 = e.changedTouches[0]?.clientX;
            if (x0 == null || x1 == null) return;
            const dx = x1 - x0;
            if (dx < -40) setReviewIdx((i) => Math.min(shots.length - 1, i + 1));
            if (dx > 40) setReviewIdx((i) => Math.max(0, i - 1));
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt="" className={cn("h-full w-full object-contain transition-[filter]", !current.keep && "opacity-30")} style={{ filter: cssFilter(a), transform: `rotate(${a.rotate}deg)` }} />
          {current.id === coverId && current.keep && <span className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-black shadow-lg">★ Cover picture</span>}
          {current.existing && <span className="absolute right-3 top-3 rounded bg-white/20 px-2 py-0.5 text-xs">taken earlier</span>}
          <button type="button" onClick={() => setReviewIdx((i) => Math.max(0, i - 1))} disabled={reviewIdx === 0} className="absolute left-0 top-0 h-full w-1/5 disabled:opacity-0" aria-label="Previous" />
          <button type="button" onClick={() => setReviewIdx((i) => Math.min(shots.length - 1, i + 1))} disabled={reviewIdx === shots.length - 1} className="absolute right-0 top-0 h-full w-1/5 disabled:opacity-0" aria-label="Next" />
          {reviewIdx > 0 && <ChevronLeft className="pointer-events-none absolute left-2 top-1/2 size-8 -translate-y-1/2 opacity-70" />}
          {reviewIdx < shots.length - 1 && <ChevronRight className="pointer-events-none absolute right-2 top-1/2 size-8 -translate-y-1/2 opacity-70" />}
        </div>
        <div className="space-y-3 bg-neutral-900 px-4 pb-6 pt-3">
          {(["brightness", "contrast"] as const).map((key) => {
            const val = a[key];
            const set = (v: number) => setShot(current.id, (s) => ({ adjust: { ...s.adjust, [key]: Math.round(Math.min(1.4, Math.max(0.6, v)) * 100) / 100 } }));
            return (
              <div key={key} className="grid grid-cols-[5.5rem_2.5rem_1fr_2.5rem_3rem] items-center gap-2 text-xs">
                <span className="capitalize">{key}</span>
                <button type="button" onClick={() => set(val - 0.05)} className="h-9 rounded border border-white/40 text-lg leading-none" aria-label={`${key} down`}>−</button>
                <input type="range" min="0.6" max="1.4" step="0.02" value={val} onChange={(e) => set(Number(e.target.value))} className="accent-white" />
                <button type="button" onClick={() => set(val + 0.05)} className="h-9 rounded border border-white/40 text-lg leading-none" aria-label={`${key} up`}>+</button>
                <span className="text-right tabular-nums">{val > 1 ? "+" : ""}{Math.round((val - 1) * 100)}</span>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => setShot(current.id, (s) => ({ adjust: { ...s.adjust, rotate: ((s.adjust.rotate + 90) % 360) as Adjust["rotate"] } }))} className="flex items-center gap-1 rounded border border-white/40 px-3 py-2"><RotateCw className="size-4" /> Rotate</button>
            <button type="button" onClick={() => setShot(current.id, { adjust: { ...NO_ADJUST, rotate: a.rotate } })} className="rounded border border-white/40 px-3 py-2">Reset</button>
            <button type="button" onClick={() => applyToAll(a)} className="rounded border border-white/40 px-3 py-2">Apply to all pictures</button>
            {current.keep && (current.id === coverId
              ? <span className="flex items-center gap-1 rounded bg-amber-500 px-3 py-2 font-semibold text-black"><Star className="size-4" /> This is the cover</span>
              : <button type="button" onClick={() => { toFront(current.id); setReviewIdx(0); }} className="flex items-center gap-1 rounded border border-white/40 px-3 py-2"><Star className="size-4" /> Make cover</button>)}

            <button type="button" onClick={() => { setShot(current.id, { keep: false }); setMode("shoot"); }} className="flex items-center gap-1 rounded border border-white/40 px-3 py-2"><Camera className="size-4" /> Retake this one</button>
            <button type="button" onClick={() => setShot(current.id, (s) => ({ keep: !s.keep }))} className={cn("ml-auto flex items-center gap-1 rounded px-3 py-2", current.keep ? "border border-red-400 text-red-300" : "bg-white text-black")}>{current.keep ? <><Trash2 className="size-4" /> Discard</> : <><Check className="size-4" /> Keep</>}</button>
          </div>
          <p className="text-[11px] text-neutral-400">Swipe left or right, or use the arrows, to move between pictures.</p>
          <div className="flex gap-1 overflow-x-auto">
            {shots.map((s, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={s.id} src={s.url} alt="" onClick={() => setReviewIdx(i)} className={cn("h-12 w-12 shrink-0 cursor-pointer rounded object-cover", i === reviewIdx ? "ring-2 ring-white" : "opacity-60", !s.keep && "opacity-20")} style={{ filter: cssFilter(s.adjust) }} />
            ))}
          </div>
          <p className="text-[11px] text-neutral-400">Picture 1 is the cover (★) and gets its background removed; Make cover moves a picture to first. Brightness and contrast are baked in on save; every picture is cropped square and sized for Shopify.</p>
        </div>
      </div>
    );
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {Review}
      {Profile}
      {mode === "home" && Header}
      {jobs.some((j) => j.error) && <p className="text-sm text-destructive">{jobs.filter((j) => j.error).map((j) => `${j.sku}: ${j.error}`).join(" · ")}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* ---- Home */}
      {mode === "home" && data && (
        <>
          <Button type="button" size="lg" className="h-20 w-full text-xl" onClick={startScan}><Camera className="size-7" /> New garment · scan its tag</Button>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const s = search.trim().toUpperCase(); if (s) { void openCamera().catch(() => {}); void pick(s, true); setSearch(""); } }}>
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
                      {([["all", `All · ${all.length}`], ["none", `Pending · ${data.waiting.length}`], ["done", `Done · ${data.done.length}`]] as const).map(([k, label]) => (
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
                              ? <Button type="button" size="sm" className="h-9 shrink-0" onClick={() => { void openCamera().catch(() => {}); void pick(r.sku); }}>Shoot</Button>
                              : <Button asChild type="button" size="sm" variant="outline" className="h-9 shrink-0"><Link href={`/photos/${encodeURIComponent(r.sku)}`}>Review</Link></Button>}
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
            {mode === "shoot" && !camOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                <Button type="button" size="lg" className="h-14 px-8 text-lg" onClick={() => void openCamera().catch((e) => setError(e instanceof Error ? `Camera: ${e.message}. Allow the camera for this site in Settings → Safari → Camera.` : "Camera unavailable."))}><Camera className="size-5" /> Open camera</Button>
                <p className="text-xs text-white/70">The phone asks for a tap before it opens the camera.</p>
              </div>
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
                {garment.photos > 0 && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">{garment.photos} picture{garment.photos === 1 ? "" : "s"} taken earlier — shown below; keep, adjust, discard, or add more.</div>}
              </div>
            )}
            {mode === "shoot" && (
              <>
                <Button type="button" size="lg" className="h-16 w-full text-lg" onClick={snap} disabled={!camOn || keptCount >= MAX_SHOTS}><Camera className="size-6" /> {keptCount >= MAX_SHOTS ? `${MAX_SHOTS} is the limit — untick one first` : `Take picture ${keptCount + 1}`}</Button>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onNative} />
                <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-muted-foreground underline">Or take one shot with the phone&apos;s own camera app (full resolution)</button>
                {camInfo && <p className="text-[11px] text-muted-foreground">Camera {camInfo} · saved square at 2048 px for Shopify, under 1 MB</p>}
                {shots.length > 0 && <p className="text-xs text-muted-foreground">{retaking ? "Earlier pictures are marked; keep, adjust or discard any of them and add new ones. " : ""}Press and hold a picture, then drag it to change the order — picture 1 is the cover and the order is the order on Shopify. Tap a picture to review and adjust it.</p>}
                {shots.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 select-none">
                    {shots.map((s, i) => (
                      <div key={s.id} data-key={s.id} className={cn("flex flex-col overflow-hidden rounded-md border-2 bg-background", s.keep ? (i === 0 ? "border-amber-500" : "border-green-600") : "border-dashed border-muted-foreground/40 opacity-60", drag.dragKey === s.id && "opacity-30")}>
                        <div className="relative aspect-square" style={{ touchAction: "none" }} onPointerDown={drag.onPointerDown(s.id, s.url)} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp} onPointerCancel={drag.onPointerCancel} onContextMenu={(e) => e.preventDefault()}>
                          <button type="button" onClick={() => { if (drag.dragKey == null) { setReviewIdx(i); setMode("review"); } }} className="h-full w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.url} alt={`Picture ${i + 1}`} draggable={false} className="h-full w-full object-cover" style={{ filter: cssFilter(s.adjust), transform: `rotate(${s.adjust.rotate}deg)` }} />
                          </button>
                          {i === 0 && s.keep && <span className="absolute inset-x-0 top-0 bg-amber-500 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-black">★ Cover</span>}
                          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-xs font-semibold text-white">{i + 1}</span>
                          {s.existing && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">earlier</span>}
                        </div>
                        <div className="grid grid-cols-2 divide-x border-t text-[11px]">
                          {s.keep
                            ? <button type="button" onClick={() => setShot(s.id, { keep: false })} className="flex items-center justify-center gap-1 py-1.5 text-red-700 dark:text-red-400"><Trash2 className="size-3.5" /> Delete</button>
                            : <button type="button" onClick={() => setShot(s.id, { keep: true })} className="flex items-center justify-center gap-1 py-1.5 font-semibold"><Check className="size-3.5" /> Keep</button>}
                          {i === 0 && s.keep
                            ? <span className="flex items-center justify-center gap-1 py-1.5 text-amber-700 dark:text-amber-400"><Star className="size-3.5" /> Cover</span>
                            : <button type="button" disabled={!s.keep} onClick={() => toFront(s.id)} className="flex items-center justify-center gap-1 py-1.5 disabled:opacity-40"><Star className="size-3.5" /> Make cover</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {drag.ghost && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={drag.ghost.url} alt="" className="pointer-events-none fixed z-50 rounded-md object-cover shadow-2xl ring-2 ring-primary" style={{ left: drag.ghost.x, top: drag.ghost.y, width: drag.ghost.w, height: drag.ghost.h }} />
                )}
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={autoCut} onCheckedChange={(v) => setAuto(v === true)} /> Remove the background from the cover picture (soft shadow on white)</label>
                <Button type="button" className="h-14 w-full text-base" disabled={!kept.length} onClick={requestSave}><Check className="size-5" /> Save {kept.length || ""} picture{kept.length === 1 ? "" : "s"} &amp; next garment</Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="h-11" disabled={!shots.length} onClick={() => { setReviewIdx(0); setMode("review"); }}>Review &amp; adjust</Button>
                  <Button type="button" variant="outline" className="h-11" onClick={startScan}><RefreshCw className="size-4" /> Rescan</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      {mode !== "home" && <Button type="button" variant="ghost" className="w-full" onClick={goHome}><ScanLine className="size-4" /> Back to the list</Button>}
    </div>
  );
}
