"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Scissors, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { compressUnder, onWhite } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * One garment at the photography station: take pictures, keep each under
 * 1 MB, cut the background out of the ones that need it, next garment.
 * Nothing about channels or listings lives here — those are other screens.
 */

type Photo = { path: string; url: string; kind: "original" | "cutout"; bytes: number; taken_at: string };
type Item = { sku: string; brand: string | null; sub_category: string; category: string; size_label: string | null; grade_code: string; colour: string | null; channel: string; photos: Photo[] };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`);

export function PhotoStation({ sku }: { sku: string }) {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [autoCut, setAutoCut] = useState(true);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { setAutoCut(localStorage.getItem("khz_autocut") !== "off"); } catch { /* fine */ }
  }, []);
  function setAuto(v: boolean) { setAutoCut(v); try { localStorage.setItem("khz_autocut", v ? "on" : "off"); } catch { /* fine */ } }

  const load = useCallback(async () => {
    const res = await fetch(`/api/items/${encodeURIComponent(sku)}`);
    const j = await res.json();
    if (!res.ok) { setError(j.error ?? "Not found."); return; }
    const it = j.item ?? j; // the garment lookup nests its fields under `item`
    setItem({ sku: it.sku, brand: it.brand ?? it.brand_text ?? null, sub_category: it.sub_category ?? "", category: it.category ?? "", size_label: it.size_label, grade_code: it.grade ?? it.grade_code, colour: it.colour, channel: it.channel, photos: it.photos ?? [] });
  }, [sku]);
  useEffect(() => { void load(); }, [load]);

  async function upload(file: Blob, kind: "original" | "cutout"): Promise<Photo> {
    const fd = new FormData();
    fd.append("sku", sku);
    fd.append("kind", kind);
    fd.append("file", file, kind === "cutout" ? "cutout.jpg" : "photo.jpg");
    const res = await fetch("/api/photos", { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Upload failed.");
    return j.photo as Photo;
  }

  // Background removal runs on the iPad (WebAssembly); the first run fetches
  // the model once. Output is composited onto white and kept under 1 MB.
  async function cutout(source: Blob | string): Promise<Photo> {
    const { removeBackground } = await import("@imgly/background-removal");
    const src = typeof source === "string" ? await (await fetch(source)).blob() : source;
    const png = await removeBackground(src, { output: { format: "image/png", quality: 0.9 } });
    const jpg = await compressUnder(await onWhite(png), 1024 * 1024);
    return upload(jpg, "cutout");
  }

  async function onShot(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !item) return;
    setBusy("shot");
    setNote(null);
    try {
      const isFirst = item.photos.filter((p) => p.kind === "original").length === 0;
      for (const f of files) {
        const small = await compressUnder(f, 1024 * 1024);
        await upload(small, "original");
        if (isFirst && autoCut) {
          setNote("First picture saved. Removing its background — the first run downloads the model (~40 MB), then it is cached…");
          await cutout(small);
        }
      }
      await load();
      setNote(null);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function cutExisting(p: Photo) {
    setBusy(p.path);
    setNote("Removing background…");
    try { await cutout(p.url); await load(); setNote(null); } catch (err) { setNote(err instanceof Error ? err.message : "Background removal failed."); } finally { setBusy(null); }
  }

  async function remove(p: Photo) {
    if (!window.confirm("Delete this picture?")) return;
    setBusy(p.path);
    try {
      const res = await fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, path: p.path }) });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (err) { setNote(err instanceof Error ? err.message : "Delete failed."); } finally { setBusy(null); }
  }

  if (error) return <div className="mx-auto max-w-3xl space-y-3"><p className="text-destructive">{error}</p><Button asChild variant="outline"><Link href="/photos"><ArrowLeft className="size-4" /> Back to the list</Link></Button></div>;
  if (!item) return <p className="text-muted-foreground">Loading…</p>;

  const originals = item.photos.filter((p) => p.kind === "original");
  const cutouts = item.photos.filter((p) => p.kind === "cutout");
  const cutFor = (p: Photo) => cutouts.find((c) => c.taken_at > p.taken_at && !originals.some((o) => o.taken_at > p.taken_at && o.taken_at < c.taken_at));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={onShot} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-sm text-muted-foreground">{item.sku}</p>
          <h1 className="text-xl font-bold">{item.brand ?? "—"} · {item.sub_category}</h1>
          <p className="text-sm text-muted-foreground">{item.category} · {GRADE[item.grade_code] ?? item.grade_code}{item.size_label ? ` · Size ${item.size_label}` : ""}{item.colour ? ` · ${item.colour}` : ""}</p>
        </div>
        <Button asChild variant="outline"><Link href="/photos"><ArrowLeft className="size-4" /> Next garment</Link></Button>
      </div>
      {item.channel !== "online" && <p className="rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">This is outlet stock, not an online garment. Pictures still save, but it will not appear in the queue.</p>}

      <Button type="button" size="lg" className="h-16 w-full text-lg" disabled={busy != null} onClick={() => cameraRef.current?.click()}>
        <Camera className="size-6" /> {busy === "shot" ? "Saving…" : originals.length ? "Take another picture" : "Take picture"}
      </Button>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={autoCut} onCheckedChange={(v) => setAuto(v === true)} />
        <span>Remove the background from the <strong>first</strong> picture automatically <span className="text-muted-foreground">· the full-garment shot; close-ups keep theirs</span></span>
      </label>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}

      {originals.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No pictures yet. Shot 1: the whole garment on the white background. Shot 2 onward: close-ups — fabric, label, details, any flaw.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {originals.map((p, i) => {
            const cut = cutFor(p);
            return (
              <Card key={p.path}>
                <CardContent className="space-y-2 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Picture ${i + 1}`} className="aspect-square w-full rounded object-cover" />
                    {cut ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={cut.url} alt={`Picture ${i + 1}, background removed`} className="aspect-square w-full rounded border object-contain" />
                    ) : (
                      <div className="flex aspect-square items-center justify-center rounded border border-dashed text-xs text-muted-foreground">no cut-out</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Picture {i + 1}{i === 0 ? " · whole garment" : " · close-up"} · {kb(p.bytes)}{cut ? ` · cut-out ${kb(cut.bytes)}` : ""}</span>
                    <span className="flex gap-1">
                      {!cut && <Button type="button" size="sm" variant="outline" className={cn("h-8", busy === p.path && "opacity-60")} disabled={busy != null} onClick={() => cutExisting(p)}><Scissors className="size-3.5" /> Remove background</Button>}
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={busy != null} onClick={() => remove(p)} title="Delete"><Trash2 className="size-3.5" /></Button>
                      {cut && <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={busy != null} onClick={() => remove(cut)} title="Delete the cut-out">× cut-out</Button>}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {originals.length > 0 && (
        <Button type="button" variant="outline" className="h-12 w-full" onClick={() => router.push("/photos")}>Done — next garment</Button>
      )}
    </div>
  );
}
