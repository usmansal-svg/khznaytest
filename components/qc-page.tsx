"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Printer, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * QC as review. The reviewer sees what the tagger entered and either
 * approves it as is or corrects the fields that are wrong. Corrections go
 * on the garment (repriced if the condition or type changed) and onto the
 * tagger's monthly scorecard.
 */

type Item = { id: number; sku: string; brand: string; grade: string; size_label: string; season: string; wearer: string; is_rare: boolean; sub_category_slug: string; sub_category: string; category: string; gender: string; price: number | null; photo: string | null; tagged_at: string; tagger: string; held: boolean; done?: boolean };
type Ref = { grades: { code: string; name: string }[]; sub_categories: { slug: string; name: string; category_slug: string; gender: string }[]; categories: { slug: string; name: string; gender: string }[] };
type Draft = { grade: string; brand_text: string; sub_category_slug: string; size_label: string; season: string; wearer: string; is_rare: boolean; note: string };
type Verdict = { sku: string; outcome: string; corrections: { label: string; from: string | boolean | null; to: string | boolean | null }[]; price_before: number | null; price_after: number | null; reprint: boolean };

const GRADE_LABEL: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const WEARERS = ["men", "women", "boy", "girl", "infant", "unisex"];
const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const fmt = (v: string | boolean | null) => (v == null || v === "" ? "—" : typeof v === "boolean" ? (v ? "yes" : "no") : GRADE_LABEL[v] ?? v);

export function QcPage() {
  const [mode, setMode] = useState<"held" | "photo">("held");
  const [queue, setQueue] = useState<Item[]>([]);
  const [pool, setPool] = useState<number | null>(null);
  const [current, setCurrent] = useState<Item | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ref, setRef] = useState<Ref | null>(null);
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState({ correct: 0, corrected: 0 });
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/reference").then((r) => r.json()).then((j) => setRef({ grades: j.grades, sub_categories: j.sub_categories, categories: j.categories })); }, []);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/qc?mode=${mode}`).then((r) => r.json()).then((j) => {
      if (cancelled) return;
      if (j.error) return setError(j.error);
      setQueue(j.items ?? []); setPool(j.pool ?? null);
      pick((j.items ?? []).find((i: Item) => !i.done) ?? null);
    });
    return () => { cancelled = true; };
  }, [mode]);

  function pick(it: Item | null) {
    setCurrent(it); setVerdict(null);
    setDraft(it ? { grade: it.grade, brand_text: it.brand, sub_category_slug: it.sub_category_slug, size_label: it.size_label, season: it.season, wearer: it.wearer, is_rare: it.is_rare, note: "" } : null);
  }
  async function lookup() {
    const sku = scan.trim().toUpperCase(); if (!sku) return;
    setScan(""); setError(null);
    const res = await fetch(`/api/qc?mode=lookup&sku=${encodeURIComponent(sku)}`);
    const j = await res.json();
    if (!res.ok) { setError(j.error); return; }
    if (j.already_reviewed) setError(`${sku} was already reviewed on ${new Date(j.already_reviewed.reviewed_at).toLocaleDateString("en-PK")} (${j.already_reviewed.outcome}). You can review it again.`);
    pick(j.item);
  }
  const changed = current && draft && (draft.grade !== current.grade || draft.brand_text.trim() !== current.brand || draft.sub_category_slug !== current.sub_category_slug || draft.size_label.trim() !== current.size_label || draft.season !== current.season || draft.wearer !== current.wearer || draft.is_rare !== current.is_rare);

  async function submit(approveAsIs: boolean) {
    if (!current || !draft) return;
    setBusy(true); setError(null);
    try {
      const body = approveAsIs ? { sku: current.sku, method: mode === "photo" ? "photo" : "physical" } : { sku: current.sku, method: mode === "photo" ? "photo" : "physical", note: draft.note, grade: draft.grade, brand_text: draft.brand_text, sub_category_slug: draft.sub_category_slug, size_label: draft.size_label, season: draft.season, wearer: draft.wearer, is_rare: draft.is_rare };
      const res = await fetch("/api/qc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setVerdict({ sku: current.sku, outcome: j.outcome, corrections: j.corrections, price_before: j.price_before, price_after: j.price_after, reprint: j.reprint });
      setTally((t) => ({ ...t, [j.outcome]: t[j.outcome as "correct" | "corrected"] + 1 }));
      const rest = queue.map((q) => (q.id === current.id ? { ...q, done: true } : q));
      setQueue(rest);
      setCurrent(null); setDraft(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(false); scanRef.current?.focus(); }
  }

  const remaining = queue.filter((q) => !q.done).length;
  const cats = ref && draft ? ref.categories : [];
  const subsFor = (catSlug: string) => ref?.sub_categories.filter((s) => s.category_slug === catSlug) ?? [];
  const currentCat = ref && draft ? ref.sub_categories.find((s) => s.slug === draft.sub_category_slug)?.category_slug ?? "" : "";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">QC · review the tagging</h1><p className="text-sm text-muted-foreground">Pick up the garment, check what the tagger entered against it, and approve it or correct what is wrong. Corrections go on the tagger&apos;s scorecard.</p></div>
        <div className="flex gap-1 rounded-md border p-1 text-sm">
          <button onClick={() => setMode("held")} className={cn("rounded px-3 py-1", mode === "held" ? "bg-foreground text-background" : "hover:bg-muted")}>Held for QC{mode === "held" && queue.length ? ` · ${remaining}` : ""}</button>
          <button onClick={() => setMode("photo")} className={cn("rounded px-3 py-1", mode === "photo" ? "bg-foreground text-background" : "hover:bg-muted")}>By photo · 30 this week</button>
        </div>
      </div>
      {mode === "held" && (
        <Card><CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <form onSubmit={(e) => { e.preventDefault(); void lookup(); }} className="relative min-w-[16rem] flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan a tag from the QC rail" className="h-11 pl-10 text-base" autoComplete="off" autoCapitalize="characters" />
          </form>
          <span className="text-sm text-muted-foreground">{queue.length === 0 ? "Nothing held — the rail is clear." : `${remaining} garment${remaining === 1 ? "" : "s"} waiting on the QC rail`}</span>
        </CardContent></Card>
      )}
      {mode === "photo" && pool != null && <p className="text-sm text-muted-foreground">{queue.length} chosen at random from {pool} photographed garments tagged in the last 7 days. The same 30 stay until you finish them.</p>}
      {error && <p className="rounded-md border border-amber-600 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="pt-6">
            {!current || !draft ? (
              <p className="py-10 text-center text-muted-foreground">{mode === "held" ? "The QC rail is clear. Held garments appear here as taggers set them aside." : "Nothing left to review this week."}</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {current.photo ? <img src={current.photo} alt="" className="aspect-square w-full rounded-md object-cover" /> : <div className="flex aspect-square items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">No photo</div>}
                  <div className="mt-2 font-mono text-xs text-muted-foreground">{current.sku}</div>
                  <div className="text-xs text-muted-foreground">Tagged by <span className="font-medium text-foreground">{current.tagger}</span> · {new Date(current.tagged_at).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  {current.price != null && <div className="mt-1 text-lg font-bold">{pkr(current.price)}</div>}
                </div>
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Everything below is what the tagger entered. Change only what is wrong.</p>
                  <div className="grid gap-1">
                    <Label>Condition</Label>
                    <div className="flex flex-wrap gap-1.5">{(ref?.grades ?? []).map((g) => <Button key={g.code} type="button" size="sm" variant={draft.grade === g.code ? "default" : "outline"} className={cn("h-9", g.code !== current.grade && draft.grade === g.code && "ring-2 ring-amber-500")} onClick={() => setDraft({ ...draft, grade: g.code })}>{GRADE_LABEL[g.code] ?? g.name}</Button>)}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1"><Label>Brand</Label><Input value={draft.brand_text} onChange={(e) => setDraft({ ...draft, brand_text: e.target.value })} className={cn("h-9", draft.brand_text.trim() !== current.brand && "border-amber-500")} /></div>
                    <div className="grid gap-1"><Label>Size on label</Label><Input value={draft.size_label} onChange={(e) => setDraft({ ...draft, size_label: e.target.value })} className={cn("h-9", draft.size_label.trim() !== current.size_label && "border-amber-500")} /></div>
                    <div className="grid gap-1"><Label>Category</Label>
                      <select value={currentCat} onChange={(e) => { const first = subsFor(e.target.value)[0]; if (first) setDraft({ ...draft, sub_category_slug: first.slug }); }} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">{cats.map((c) => <option key={c.slug} value={c.slug}>{c.gender} · {c.name}</option>)}</select>
                    </div>
                    <div className="grid gap-1"><Label>Garment type</Label>
                      <select value={draft.sub_category_slug} onChange={(e) => setDraft({ ...draft, sub_category_slug: e.target.value })} className={cn("h-9 rounded-md border border-input bg-transparent px-2 text-sm", draft.sub_category_slug !== current.sub_category_slug && "border-amber-500")}>{subsFor(currentCat).map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}</select>
                    </div>
                    <div className="grid gap-1"><Label>Season</Label><select value={draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value })} className={cn("h-9 rounded-md border border-input bg-transparent px-2 text-sm", draft.season !== current.season && "border-amber-500")}><option value="summer">Summer</option><option value="winter">Winter</option></select></div>
                    <div className="grid gap-1"><Label>Wearer</Label><select value={draft.wearer} onChange={(e) => setDraft({ ...draft, wearer: e.target.value })} className={cn("h-9 rounded-md border border-input bg-transparent px-2 text-sm capitalize", draft.wearer !== current.wearer && "border-amber-500")}>{WEARERS.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.is_rare} onCheckedChange={(v) => setDraft({ ...draft, is_rare: v === true })} /> ★ Rare find</label>
                  {changed && <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Note for the tagger — optional, e.g. stain on the cuff was missed" className="h-9" />}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="button" className="h-12 flex-1" variant={changed ? "outline" : "default"} disabled={busy} onClick={() => submit(true)}><Check className="size-4" /> Correct as tagged</Button>
                    <Button type="button" className="h-12 flex-1" disabled={busy || !changed} onClick={() => submit(false)}>{busy ? "Saving…" : "Save corrections"}</Button>
                  </div>
                  {mode === "photo" && <p className="text-xs text-muted-foreground">From a photo you can judge tags, brand, type and visible marks; fabric wear needs the garment in hand.</p>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {verdict && (
            <Card className={cn(verdict.outcome === "correct" ? "border-green-600" : "border-amber-500")}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{verdict.sku}</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {verdict.outcome === "correct" ? <div className="font-medium text-green-700 dark:text-green-400">Approved as tagged.</div> : (
                  <>
                    <div className="font-medium text-amber-700 dark:text-amber-300">{verdict.corrections.length} correction{verdict.corrections.length === 1 ? "" : "s"} recorded against the tagger.</div>
                    <ul className="mt-1 space-y-0.5 text-xs">{verdict.corrections.map((c, i) => <li key={i}>{c.label}: <span className="line-through">{fmt(c.from)}</span> → <span className="font-semibold">{fmt(c.to)}</span></li>)}</ul>
                    {verdict.price_before !== verdict.price_after && verdict.price_after != null && <div className="mt-1 text-xs">Price {verdict.price_before != null ? pkr(verdict.price_before) : "—"} → <span className="font-semibold">{pkr(verdict.price_after)}</span></div>}
                  </>
                )}
                {verdict.reprint && <Button asChild size="sm" variant="outline" className="mt-2"><a href={`/items/${verdict.sku}/print`} target="_blank" rel="noreferrer"><Printer className="size-4" /> Reprint the tag</a></Button>}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">This session</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-center text-sm">
              <div><div className="text-2xl font-bold text-green-700 dark:text-green-400">{tally.correct}</div>correct</div>
              <div><div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{tally.corrected}</div>corrected</div>
            </CardContent>
          </Card>
          {queue.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Queue</CardTitle></CardHeader>
              <CardContent><ul className="max-h-80 divide-y overflow-auto text-sm">{queue.map((q) => <li key={q.id}><button type="button" onClick={() => !q.done && pick(q)} className={cn("w-full py-1.5 text-left", q.done ? "text-muted-foreground line-through" : current?.id === q.id ? "font-semibold" : "")}><span className="font-mono text-xs">{q.sku}</span> · {q.brand || "—"} · {q.sub_category}</button></li>)}</ul></CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
