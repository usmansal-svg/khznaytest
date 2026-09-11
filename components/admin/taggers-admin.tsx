"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tagger = { id: number; name: string; days_worked: number; tagged: number; per_day: number; target: number; expected: number; target_pct: number; reviewed: number; corrected: number; correction_rate: number | null; accuracy_pct: number | null; fields: Record<string, number>; grade_low: number; grade_high: number; price_impact: number; under_priced: number; rejects: number; manual_prices: number; score: number; finalised: { score: number; note: string | null; at: string; by: string } | null; recent: { sku: string; at: string; by: string; corrections: { label: string; from: string | boolean | null; to: string | boolean | null }[]; note: string | null }[] };
const FIELD: Record<string, string> = { grade: "Condition", brand_text: "Brand", sub_category_slug: "Garment type", size_label: "Size", season: "Season", wearer: "Wearer", is_rare: "Rare find" };
const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const fmt = (v: string | boolean | null) => (v == null || v === "" ? "—" : typeof v === "boolean" ? (v ? "yes" : "no") : GRADE[v] ?? v);

/** The monthly tagger scorecard: target achievement and QC accuracy, one score, finalised by a manager. */
export function TaggersAdmin() {
  const [month, setMonth] = useState("");
  const [data, setData] = useState<{ month: string; weights: { target: number; accuracy: number }; default_target: number; taggers: Tagger[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setMonth(new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7)); }, []);
  const load = useCallback(async () => { if (!month) return; const r = await fetch(`/api/admin/taggers?month=${month}`); const j = await r.json(); if (r.ok) setData(j); else setMsg(j.error); }, [month]);
  useEffect(() => { void load(); }, [load]);
  async function finalise(id: number) {
    const r = await fetch("/api/admin/taggers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month, staff_id: id, note }) });
    const j = await r.json(); setMsg(r.ok ? `Score ${j.score} finalised.` : j.error); setNote(""); void load();
  }
  const tone = (n: number | null) => (n == null ? "" : n >= 90 ? "text-green-700 dark:text-green-400" : n >= 70 ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-400");
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Taggers · monthly scorecard</h1><p className="text-sm text-muted-foreground">Score = {data ? Math.round(data.weights.target * 100) : 60}% target achievement + {data ? Math.round(data.weights.accuracy * 100) : 40}% QC accuracy. Target achievement is garments tagged against days worked × daily target; accuracy is the share of QC-reviewed garments that needed no correction.</p></div>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 w-44" />
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      {data && (
        <Card><CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="p-2">Tagger</th><th className="p-2 text-right">Days</th><th className="p-2 text-right">Tagged</th><th className="p-2 text-right">Per day / target</th><th className="p-2 text-right">Target</th><th className="p-2 text-right">Reviewed</th><th className="p-2 text-right">Corrected</th><th className="p-2 text-right">Accuracy</th><th className="p-2 text-right">Under-priced</th><th className="p-2 text-right">Score</th><th className="p-2"></th></tr></thead>
            <tbody className="divide-y">
              {data.taggers.map((t) => (
                <>
                  <tr key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(open === t.id ? null : t.id)}>
                    <td className="p-2 font-medium">{t.name}{t.finalised && <span className="ml-2 rounded-full border border-green-600 px-2 text-[11px] text-green-700 dark:text-green-400">finalised {t.finalised.score}</span>}</td>
                    <td className="p-2 text-right tabular-nums">{t.days_worked}</td><td className="p-2 text-right tabular-nums">{t.tagged}</td><td className="p-2 text-right tabular-nums">{t.per_day} / {t.target}</td>
                    <td className={cn("p-2 text-right tabular-nums font-semibold", tone(t.target_pct))}>{t.target_pct}%</td>
                    <td className="p-2 text-right tabular-nums">{t.reviewed}</td><td className="p-2 text-right tabular-nums">{t.corrected}</td>
                    <td className={cn("p-2 text-right tabular-nums font-semibold", tone(t.accuracy_pct))}>{t.accuracy_pct != null ? `${t.accuracy_pct}%` : "—"}</td>
                    <td className="p-2 text-right tabular-nums">{t.under_priced}</td>
                    <td className={cn("p-2 text-right text-lg font-bold tabular-nums", tone(t.score))}>{t.score}</td>
                    <td className="p-2 text-xs text-muted-foreground">{open === t.id ? "▲" : "▼"}</td>
                  </tr>
                  {open === t.id && (
                    <tr key={`${t.id}-d`}><td colSpan={11} className="bg-muted/30 p-3">
                      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                        <div className="space-y-1 text-sm">
                          <div className="font-medium">What QC corrected</div>
                          {Object.keys(t.fields).length === 0 ? <p className="text-muted-foreground">Nothing corrected this month{t.reviewed ? ` in ${t.reviewed} reviews` : " (not reviewed yet)"}.</p> : (
                            <ul className="text-xs">{Object.entries(t.fields).sort(([, a], [, b]) => b - a).map(([f, n]) => <li key={f}>{FIELD[f] ?? f}: {n}{f === "grade" ? ` (graded too low ${t.grade_low}, too high ${t.grade_high})` : ""}</li>)}</ul>
                          )}
                          {t.price_impact !== 0 && <p className="text-xs text-muted-foreground">Net price change from corrections: {t.price_impact > 0 ? "+" : ""}Rs {t.price_impact.toLocaleString()}</p>}
                          <p className="text-xs text-muted-foreground">Rejects {t.rejects} · prices by hand {t.manual_prices} · expected {t.expected} garments for {t.days_worked} days at {t.target}/day</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Month-end note (optional)" className="h-9 w-64" /><Button size="sm" onClick={() => finalise(t.id)}>{t.finalised ? "Re-finalise" : "Finalise score"} · {t.score}</Button>{t.finalised && <span className="text-xs text-muted-foreground">finalised {new Date(t.finalised.at).toLocaleDateString("en-PK")} by {t.finalised.by}{t.finalised.note ? ` · ${t.finalised.note}` : ""}</span>}</div>
                        </div>
                        <div className="text-sm">
                          <div className="font-medium">Recent corrections</div>
                          {t.recent.length === 0 ? <p className="text-muted-foreground">None.</p> : <ul className="max-h-56 space-y-1 overflow-auto text-xs">{t.recent.map((r, i) => <li key={i}><span className="font-mono">{r.sku}</span> · {new Date(r.at).toLocaleDateString("en-PK")} · {r.by}: {r.corrections.map((c) => `${c.label} ${fmt(c.from)} → ${fmt(c.to)}`).join("; ")}{r.note ? ` — ${r.note}` : ""}</li>)}</ul>}
                        </div>
                      </div>
                    </td></tr>
                  )}
                </>
              ))}
              {data.taggers.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Nothing tagged or reviewed in {data.month}.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}
