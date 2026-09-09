"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Item = { id: number; sku: string; brand: string; size_label: string | null; colour: string | null; sub_category: string; category: string; gender: string; photo: string | null; tagged_at: string; tagger: string; held: boolean; done?: boolean };
const GRADES = [
  { code: "bnwt", label: "BNWT", hint: "Original tags on" },
  { code: "premium", label: "Premium", hint: "No faults" },
  { code: "excellent", label: "Excellent", hint: "Minor stain or repair" },
  { code: "very_good", label: "Very Good", hint: "Fabric visibly used" },
  { code: "rejected", label: "Reject", hint: "Unsellable" },
];
const LABEL: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };

/**
 * Blind regrading. The screen never shows the tagger's grade; the verdict
 * appears only after the senior has chosen.
 */
export function QcPage() {
  const [mode, setMode] = useState<"held" | "photo">("held");
  const [queue, setQueue] = useState<Item[]>([]);
  const [pool, setPool] = useState<number | null>(null);
  const [current, setCurrent] = useState<Item | null>(null);
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<{ sku: string; original: string; audit: string; direction: string; delta: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState({ agree: 0, low: 0, high: 0 });
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/qc?mode=${mode}`).then((r) => r.json()).then((j) => {
      if (cancelled) return;
      if (j.error) return setError(j.error);
      setQueue(j.items ?? []);
      setPool(j.pool ?? null);
      setCurrent((j.items ?? []).find((i: Item) => !i.done) ?? null);
    });
    return () => { cancelled = true; };
  }, [mode]);

  async function lookup() {
    const sku = scan.trim();
    setScan("");
    if (!sku) return;
    const res = await fetch(`/api/qc?mode=lookup&sku=${encodeURIComponent(sku)}`);
    const j = await res.json();
    if (!res.ok) return setError(j.error);
    setError(j.already_audited ? `Already audited on ${new Date(j.already_audited).toLocaleDateString("en-PK")} — grading again anyway.` : null);
    setCurrent(j.item);
    setVerdict(null);
  }

  async function grade(g: string) {
    if (!current) return;
    setBusy(true);
    try {
      const res = await fetch("/api/qc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku: current.sku, grade: g, method: mode === "photo" ? "photo" : "physical" }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setVerdict({ sku: current.sku, original: j.original_grade, audit: j.audit_grade, direction: j.direction, delta: j.price_delta });
      setTally((t) => ({ agree: t.agree + (j.direction === "agree" ? 1 : 0), low: t.low + (j.direction === "tagger_low" ? 1 : 0), high: t.high + (j.direction === "tagger_high" ? 1 : 0) }));
      const rest = queue.map((q) => (q.id === current.id ? { ...q, done: true } : q));
      setQueue(rest);
      setCurrent(rest.find((q) => !q.done) ?? null);
      setTimeout(() => scanRef.current?.focus(), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  const remaining = queue.filter((q) => !q.done).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">QC · regrade blind</h1><p className="text-sm text-muted-foreground">You never see the tagger&apos;s grade until you&apos;ve chosen yours. When in doubt, grade up.</p></div>
        <div className="flex gap-1 rounded-md border p-1 text-sm">
          <button onClick={() => { setMode("held"); setCurrent(null); setVerdict(null); }} className={cn("rounded px-3 py-1", mode === "held" ? "bg-foreground text-background" : "hover:bg-muted")}>Held for QC{mode === "held" && queue.length ? ` · ${remaining}` : ""}</button>
          <button onClick={() => { setMode("photo"); setCurrent(null); setVerdict(null); }} className={cn("rounded px-3 py-1", mode === "photo" ? "bg-foreground text-background" : "hover:bg-muted")}>By photo · 30 this week</button>
        </div>
      </div>

      {mode === "held" && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <form onSubmit={(e) => { e.preventDefault(); void lookup(); }} className="relative flex-1 min-w-[16rem]">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan a tag from the QC rail" className="h-11 pl-10 text-base" autoComplete="off" autoCapitalize="characters" />
            </form>
            <span className="text-sm text-muted-foreground">{queue.length === 0 ? "Nothing held — the rail is clear." : `${remaining} garment${remaining === 1 ? "" : "s"} waiting on the QC rail`}</span>
          </CardContent>
        </Card>
      )}
      {mode === "photo" && pool != null && <p className="text-sm text-muted-foreground">{queue.length} chosen at random from {pool} photographed garments tagged in the last 7 days. The same 30 stay until you finish them.</p>}
      {error && <p className="rounded-md border border-amber-600 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="pt-6">
            {!current ? (
              <p className="py-10 text-center text-muted-foreground">{mode === "held" ? "The QC rail is clear. Held garments appear here as taggers set them aside." : "Nothing left to review this week."}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
                <div className="aspect-square overflow-hidden rounded-md border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {current.photo ? <img src={current.photo} alt={current.sku} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-sm text-muted-foreground">No photo</div>}
                </div>
                <div className="space-y-3">
                  <div><div className="font-mono text-xs text-muted-foreground">{current.sku} · tagged by {current.tagger} · {new Date(current.tagged_at).toLocaleString("en-PK", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div><div className="text-xl font-bold">{current.brand} · {current.sub_category}</div><div className="text-sm text-muted-foreground capitalize">{current.gender} · {current.category} · size {current.size_label ?? "—"}{current.colour ? ` · ${current.colour}` : ""}</div></div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {GRADES.map((g) => (
                      <Button key={g.code} variant="outline" disabled={busy} onClick={() => grade(g.code)} className={cn("h-16 flex-col gap-0", g.code === "rejected" && "border-red-300 text-red-700 dark:text-red-400")}>
                        <span className="font-semibold">{g.label}</span><span className="text-[11px] font-normal text-muted-foreground">{g.hint}</span>
                      </Button>
                    ))}
                  </div>
                  {mode === "photo" && <p className="text-xs text-muted-foreground">From a photo you can judge tags and visible marks; fabric wear needs the garment in hand. Grade what you can see.</p>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {verdict && (
            <Card className={cn(verdict.direction === "agree" ? "border-green-600" : "border-amber-500")}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{verdict.sku}</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <div>Tagger said <span className="font-semibold">{LABEL[verdict.original]}</span>, you said <span className="font-semibold">{LABEL[verdict.audit]}</span>.</div>
                <div className={cn("mt-1 font-medium", verdict.direction === "agree" ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-300")}>
                  {verdict.direction === "agree" ? "Agreed." : verdict.direction === "tagger_low" ? "Tagger graded too low — this is the costly direction." : "Tagger graded too high."}
                </div>
                {verdict.delta != null && verdict.delta !== 0 && <div className="mt-1 text-xs text-muted-foreground">Price should have been Rs {Math.abs(verdict.delta).toLocaleString("en-PK")} {verdict.delta > 0 ? "higher" : "lower"}.</div>}
                <div className="mt-1 text-xs text-muted-foreground">Released — it can go on a transfer now.</div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">This session</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center text-sm">
              <div><div className="text-2xl font-bold tabular-nums">{tally.agree}</div><div className="text-xs text-muted-foreground">agreed</div></div>
              <div><div className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{tally.low}</div><div className="text-xs text-muted-foreground">too low</div></div>
              <div><div className="text-2xl font-bold tabular-nums">{tally.high}</div><div className="text-xs text-muted-foreground">too high</div></div>
            </CardContent>
          </Card>
          {queue.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Queue</CardTitle></CardHeader>
              <CardContent><ul className="max-h-64 space-y-1 overflow-auto text-xs">{queue.map((q) => <li key={q.id}><button className={cn("w-full rounded px-2 py-1 text-left font-mono hover:bg-muted", q.done && "line-through opacity-50", current?.id === q.id && "bg-muted")} onClick={() => { setCurrent(q); setVerdict(null); }}>{q.sku} <span className="font-sans text-muted-foreground">· {q.sub_category}</span></button></li>)}</ul></CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
