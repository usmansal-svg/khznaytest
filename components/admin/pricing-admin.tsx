"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Settings } from "@/lib/pricing/constants";

type SettingsResponse = { settings: Settings; version: number; source: string; history: { version: number; note: string | null; created_at: string; by: string | null }[]; audits: { id: number; table: string; key: string; at: string; by: string; note: string | null; changes: { field: string; from: string; to: string }[] }[]; warning?: string };
type Preview = { rows: { slug: string; name: string; profile: string; weight_kg: number; current: number; proposed: number; change_pct: number }[]; multiples: { profile: string; current: number; proposed: number }[] };
type SubRow = { slug: string; code: string; name: string; gender: string; weight_kg: number; profile_code: string; value_index: number; market_ceiling: number | null; market_price: number | null; active: boolean; estimate?: { landed_cost: number; bnwt: number; premium: number; excellent: number; very_good: number; gp_pct: number } };

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

/** Every constant from spec sections 1–2, grouped the way the spec presents them. */
const FIELDS: { key: keyof Settings; label: string; unit?: string; step: number; group: string; help: string }[] = [
  { key: "fx", label: "Exchange rate", unit: "PKR per USD", step: 0.01, group: "Cost", help: "Update when you buy the next bale." },
  { key: "blendedRate", label: "Planning rate", unit: "USD per kg", step: 0.01, group: "Cost", help: "Used only for quotes with no lot selected. Real cost comes from each lot's own rate and yield." },
  { key: "defaultProvisionalYield", label: "Default provisional yield", unit: "0–1", step: 0.01, group: "Cost", help: "Share of bought kg assumed to reach a tag while a lot is open. 0.90 until three or four closed lots give a real number." },
  { key: "dutyPerKg", label: "Import duty", unit: "PKR per kg", step: 1, group: "Cost", help: "Charged on weight, so heavier garments carry more." },
  { key: "sortingPerPiece", label: "Sorting per piece", unit: "PKR", step: 1, group: "Cost", help: "Deliberately zero — sorting labour sits in overheads." },
  { key: "inputTaxRate", label: "Input sales tax", unit: "0–1", step: 0.01, group: "Tax", help: "Paid at import. Open item: confirm with the accountant." },
  { key: "inputTaxRecover", label: "Input tax recoverable", unit: "0–1", step: 0.01, group: "Tax", help: "Share recoverable against output tax." },
  { key: "salesTax", label: "Sales tax on shelf price", unit: "0–1", step: 0.01, group: "Tax", help: "Shelf prices are tax inclusive." },
  { key: "targetGP", label: "Target gross profit", unit: "0–1 of ex-tax revenue", step: 0.01, group: "Margin", help: "The whole book aims here after markdowns, pulls and the grade mix." },
  { key: "rejectedShare", label: "Rejected at sorting", unit: "0–1", step: 0.01, group: "Margin", help: "Graded out before the floor." },
  { key: "bulkRecovery", label: "Bulk recovery", unit: "0–1 of cost", step: 0.01, group: "Margin", help: "What rejected and pulled stock fetches by weight." },
  { key: "charmStep", label: "Rounding step", unit: "PKR", step: 1, group: "Rounding", help: "Prices land on a multiple of this, plus the ending." },
  { key: "charmEnd", label: "Price ending", unit: "PKR", step: 1, group: "Rounding", help: "Every price ends in this. 90 means 1,290 not 1,300." },
  { key: "minPrice", label: "Minimum price", unit: "PKR", step: 10, group: "Rounding", help: "Floor for any grade at any markdown." },
  { key: "highValueThreshold", label: "High-value threshold", unit: "PKR", step: 100, group: "Control", help: "Items above this go to the QC review queue." },
];

export function PricingAdmin() {
  const [loaded, setLoaded] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((j: SettingsResponse) => {
        setLoaded(j);
        setDraft(j.settings);
      });
  }, []);

  const dirty = useMemo(() => loaded && draft && JSON.stringify(loaded.settings) !== JSON.stringify(draft), [loaded, draft]);

  // Preview follows the draft with a short debounce, so the operator always
  // sees what a change does before it can be saved.
  useEffect(() => {
    if (!draft || !dirty) {
      setPreview(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch("/api/admin/settings?preview=1", { method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal, body: JSON.stringify({ settings: draft }) });
      const j = await res.json();
      if (res.ok) setPreview(j);
      else setMessage({ tone: "error", text: j.error });
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [draft, dirty]);

  async function save() {
    if (!draft || !dirty) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings: draft, note }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed.");
      setMessage({ tone: "ok", text: `Saved as settings version ${j.version}. Every new price now uses it.` });
      setNote("");
      const fresh = await (await fetch("/api/admin/settings")).json();
      setLoaded(fresh);
      setDraft(fresh.settings);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded || !draft) return <p className="text-muted-foreground">Loading…</p>;

  const groups = [...new Set(FIELDS.map((f) => f.group))];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pricing</h1>
          <p className="text-sm text-muted-foreground">
            Settings version <span className="font-mono font-semibold">{loaded.version}</span> · source: {loaded.source}. Changing anything here reprices every new tag; items already tagged keep their version.
          </p>
        </div>
      </div>
      {loaded.warning && <Note tone="error">{loaded.warning}</Note>}

      <Tabs defaultValue="constants">
        <TabsList>
          <TabsTrigger value="constants">Constants</TabsTrigger>
          <TabsTrigger value="profiles">Selling profiles</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
          <TabsTrigger value="subcategories">Categories</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------- constants */}
        <TabsContent value="constants" className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Markdown ladder</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                {(["Markdown 1 · 25% OFF sticker", "Markdown 2 · HALF PRICE sticker", "Final · LAST CHANCE sticker"] as const).map((label, i) => (
                  <div key={label} className="grid gap-1.5">
                    <Label htmlFor={`md${i}`}>{label} <span className="font-normal text-muted-foreground">· % off</span></Label>
                    <Input id={`md${i}`} type="number" step="1" min="1" max="99" value={Math.round(draft.ladderDepths[i] * 100)} onChange={(e) => { const d = [...draft.ladderDepths] as [number, number, number]; d[i] = Number(e.target.value) / 100; setDraft({ ...draft, ladderDepths: d }); }} className={cn(draft.ladderDepths[i] !== loaded.settings.ladderDepths[i] && "border-amber-500")} />
                    <p className="text-xs text-muted-foreground">{i === 0 ? "One colour back." : i === 1 ? "Two colours back." : "Three colours back; four is pulled."}</p>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground sm:col-span-3">Depths feed the blended discount, so a change moves the multiple and every price — not just the stickers. Watch the preview.</p>
              </CardContent>
            </Card>
            {groups.map((g) => (
              <Card key={g}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{g}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  {FIELDS.filter((f) => f.group === g).map((f) => (
                    <div key={f.key} className="grid gap-1.5">
                      <Label htmlFor={f.key}>
                        {f.label} {f.unit && <span className="font-normal text-muted-foreground">· {f.unit}</span>}
                      </Label>
                      <Input
                        id={f.key}
                        type="number"
                        step={f.step}
                        value={String(draft[f.key])}
                        onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
                        className={cn(draft[f.key] !== loaded.settings[f.key] && "border-amber-500")}
                      />
                      <p className="text-xs text-muted-foreground">{f.help}</p>
                    </div>
                  ))}
                  {g === "Margin" && (
                    <label className="flex items-start gap-2 text-sm sm:col-span-2">
                      <Checkbox checked={draft.brandFeedbackEnabled} onCheckedChange={(v) => setDraft({ ...draft, brandFeedbackEnabled: v === true })} className="mt-0.5" />
                      <span>
                        <span className="font-medium">Brand-tier feedback</span>
                        <span className="block text-xs text-muted-foreground">On: regular prices divide by the blended brand uplift (1.05) so the whole book hits target together and everyday prices fall about 5%. Off: luxury is pure upside.</span>
                      </span>
                    </label>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ------------------------------------------ reprice preview */}
          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Reprice preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!dirty && <p className="text-sm text-muted-foreground">Change a value to see what it does to a dozen representative garments before saving.</p>}
                {preview && (
                  <>
                    <table className="w-full text-xs">
                      <thead className="text-left uppercase text-muted-foreground">
                        <tr><th className="pb-1">Multiple</th><th className="pb-1 text-right">Now</th><th className="pb-1 text-right">Proposed</th></tr>
                      </thead>
                      <tbody>
                        {preview.multiples.map((m) => (
                          <tr key={m.profile}><td className="capitalize">{m.profile}</td><td className="text-right tabular-nums">{m.current.toFixed(4)}</td><td className={cn("text-right tabular-nums font-semibold", m.proposed !== m.current && "text-amber-600 dark:text-amber-400")}>{m.proposed.toFixed(4)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    <table className="w-full text-xs">
                      <thead className="text-left uppercase text-muted-foreground">
                        <tr><th className="pb-1">Premium price</th><th className="pb-1 text-right">Now</th><th className="pb-1 text-right">Proposed</th><th className="pb-1 text-right">Δ</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {preview.rows.map((r) => (
                          <tr key={r.slug}>
                            <td className="py-1">{r.name} <span className="text-muted-foreground">· {r.profile}</span></td>
                            <td className="py-1 text-right tabular-nums">{rs(r.current)}</td>
                            <td className="py-1 text-right tabular-nums font-semibold">{rs(r.proposed)}</td>
                            <td className={cn("py-1 text-right tabular-nums", r.change_pct > 0 ? "text-green-700 dark:text-green-400" : r.change_pct < 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>{pct(r.change_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                <div className="grid gap-2 border-t pt-4">
                  <Label htmlFor="note">Why this change</Label>
                  <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. New bale at 6.90/kg, rate 285" />
                  <div className="flex gap-2">
                    <Button onClick={save} disabled={!dirty || busy} className="flex-1">{busy ? "Saving…" : `Save as version ${loaded.version + 1}`}</Button>
                    <Button variant="outline" onClick={() => setDraft(loaded.settings)} disabled={!dirty || busy}>Reset</Button>
                  </div>
                  {message && <Note tone={message.tone}>{message.text}</Note>}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="profiles">
          <ProfilesEditor />
        </TabsContent>

        <TabsContent value="grades">
          <GradesEditor />
        </TabsContent>

        <TabsContent value="subcategories">
          <SubCategoryEditor />
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Settings versions</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Version</th><th className="pb-2">By</th><th className="pb-2">When</th><th className="pb-2">Note</th></tr></thead>
                <tbody className="divide-y">
                  {loaded.history.map((h) => (
                    <tr key={h.version}><td className="py-2 font-mono">{h.version}</td><td className="py-2 font-medium">{h.by ?? <span className="text-muted-foreground">system</span>}</td><td className="py-2">{new Date(h.created_at).toLocaleString("en-PK")}</td><td className="py-2">{h.note ?? <span className="text-muted-foreground">—</span>}</td></tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Every change <span className="font-normal text-muted-foreground">· who, when, what</span></CardTitle></CardHeader>
            <CardContent>
              {loaded.audits.length === 0 ? <p className="text-sm text-muted-foreground">No changes recorded yet.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">When</th><th className="pb-2">By</th><th className="pb-2">Where</th><th className="pb-2">Change</th></tr></thead>
                  <tbody className="divide-y align-top">
                    {loaded.audits.map((a) => (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap py-2 text-xs">{new Date(a.at).toLocaleString("en-PK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="py-2 font-medium">{a.by}</td>
                        <td className="py-2"><span className="capitalize">{a.table.replace("_", " ")}</span> <span className="font-mono text-xs text-muted-foreground">{a.key}</span></td>
                        <td className="py-2 text-xs">
                          {a.note && <div className="mb-0.5 text-muted-foreground">{a.note}</div>}
                          {a.changes.length === 0 ? <span className="text-muted-foreground">—</span> : a.changes.slice(0, 8).map((c) => <div key={c.field}><span className="font-mono">{c.field}</span>: <span className="text-muted-foreground line-through">{c.from}</span> → <span className="font-semibold">{c.to}</span></div>)}
                          {a.changes.length > 8 && <div className="text-muted-foreground">+{a.changes.length - 8} more</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------ sub-category editor */

function SubCategoryEditor() {
  const [rows, setRows] = useState<SubRow[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<SubRow>>>({});
  const [live, setLive] = useState<Record<string, NonNullable<SubRow["estimate"]>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/sub-categories").then((r) => r.json()).then((j) => setRows(j.rows));
  }, []);

  // Live preview: every keystroke reprices the edited rows on the server
  // (debounced), shown in amber until saved. Nothing is written.
  useEffect(() => {
    const slugs = Object.keys(edits);
    if (!slugs.length) { setLive({}); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/sub-categories?preview=1", { method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal, body: JSON.stringify({ rows: slugs.map((slug) => ({ slug, ...edits[slug] })) }) });
        const j = await res.json();
        if (res.ok) setLive(j.estimates ?? {});
      } catch { /* aborted or offline — keep the last preview */ }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [edits]);

  function edit(slug: string, patch: Partial<SubRow>) {
    setEdits((e) => ({ ...e, [slug]: { ...e[slug], ...patch } }));
  }

  async function save() {
    const payload = Object.entries(edits).map(([slug, patch]) => ({ slug, ...patch }));
    if (!payload.length) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/sub-categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: payload }) });
    const j = await res.json();
    if (!res.ok && !j.results) {
      setMessage({ tone: "error", text: j.error ?? "Save failed." });
    } else {
      const failed = (j.results as { slug: string; ok: boolean; error?: string }[]).filter((r) => !r.ok);
      setMessage(failed.length ? { tone: "error", text: failed.map((f) => `${f.slug}: ${f.error}`).join(" · ") } : { tone: "ok", text: `Saved ${payload.length} sub-categor${payload.length === 1 ? "y" : "ies"}. New tags price with the new values.` });
      setEdits({});
      setLive({});
      setRows((await (await fetch("/api/admin/sub-categories")).json()).rows);
    }
    setBusy(false);
  }

  if (!rows) return <p className="text-muted-foreground">Loading…</p>;
  const dirty = Object.keys(edits).length;

  return (
    <div className="space-y-6">
    <AddForms onAdded={async (text) => { setMessage({ tone: "ok", text }); setRows((await (await fetch("/api/admin/sub-categories")).json()).rows); }} onError={(text) => setMessage({ tone: "error", text })} />
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Categories <span className="font-normal text-muted-foreground">· weight drives cost, profile drives the multiple, value index corrects the rest</span></span>
          <span className="flex items-center gap-2">
            {message && <span className={cn("text-xs", message.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{message.text}</span>}
            <Button size="sm" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : `Save ${dirty || ""} change${dirty === 1 ? "" : "s"}`}</Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">Prices shown are planning estimates at the default weight and planning rate (imported), exactly like the Excel sheet; a real garment prices from its lot and scale weight. Edit a weight, profile or index and the row&apos;s prices update as you type — in amber until you press Save. Weights are the spec&apos;s open item #1 — weigh 20 pieces per category and replace the estimates. Market ceiling warns the tagger when cost-led pricing runs above the market; market price is the &quot;new in store&quot; anchor printed on the tag.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="pb-2">Gender</th><th className="pb-2">Category</th><th className="pb-2">Code</th><th className="pb-2">Weight kg</th><th className="pb-2">Profile</th><th className="pb-2">Value index</th><th className="pb-2 text-right">Landed</th><th className="pb-2 text-right">BNWT</th><th className="pb-2 text-right">Premium</th><th className="pb-2 text-right">Excellent</th><th className="pb-2 text-right">Very Good</th><th className="pb-2 text-right">GP %</th><th className="pb-2">Market ceiling</th><th className="pb-2">Market price</th><th className="pb-2">Active</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const e = edits[r.slug] ?? {};
                const v = { ...r, ...e };
                const changed = (k: keyof SubRow) => k in e;
                const est = live[r.slug] ?? r.estimate;
                const previewing = Boolean(live[r.slug]);
                const num = cn("py-1.5 pr-2 text-right tabular-nums", previewing && "text-amber-700 dark:text-amber-400");
                return (
                  <tr key={r.slug} className={cn(!v.active && "opacity-50")}>
                    <td className="py-1.5 pr-2">
                      <select value={v.gender} onChange={(ev) => edit(r.slug, { gender: ev.target.value })} className={cn("h-8 rounded-md border border-input bg-transparent px-2 text-sm", changed("gender") && "border-amber-500")}>
                        {GENDER_OPTIONS.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 pr-2"><Input value={v.name} onChange={(ev) => edit(r.slug, { name: ev.target.value })} className={cn("h-8 w-44", changed("name") && "border-amber-500")} /></td>
                    <td className="py-1.5 pr-2 font-mono text-xs">{r.code}</td>
                    <td className="py-1.5 pr-2"><Input type="number" step="0.01" min="0.01" value={v.weight_kg} onChange={(ev) => edit(r.slug, { weight_kg: Number(ev.target.value) })} className={cn("h-8 w-24", changed("weight_kg") && "border-amber-500")} /></td>
                    <td className="py-1.5 pr-2">
                      <select value={v.profile_code} onChange={(ev) => edit(r.slug, { profile_code: ev.target.value })} className={cn("h-8 rounded-md border border-input bg-transparent px-2 text-sm", changed("profile_code") && "border-amber-500")}>
                        <option value="fast">Fast</option><option value="standard">Standard</option><option value="slow">Slow</option>
                      </select>
                    </td>
                    <td className="py-1.5 pr-2"><Input type="number" step="0.05" min="0.05" value={v.value_index} onChange={(ev) => edit(r.slug, { value_index: Number(ev.target.value) })} className={cn("h-8 w-24", changed("value_index") && "border-amber-500")} /></td>
                    <td className={cn(num, !previewing && "text-muted-foreground")}>{est ? rs(est.landed_cost) : "—"}</td>
                    <td className={num}>{est ? rs(est.bnwt) : "—"}</td>
                    <td className={cn(num, "font-semibold")}>{est ? rs(est.premium) : "—"}</td>
                    <td className={num}>{est ? rs(est.excellent) : "—"}</td>
                    <td className={num}>{est ? rs(est.very_good) : "—"}</td>
                    <td className={num}>{est ? pct(est.gp_pct) : "—"}</td>
                    <td className="py-1.5 pr-2"><Input type="number" step="100" min="0" value={v.market_ceiling ?? ""} onChange={(ev) => edit(r.slug, { market_ceiling: ev.target.value === "" ? null : Number(ev.target.value) })} className={cn("h-8 w-28", changed("market_ceiling") && "border-amber-500")} placeholder="—" /></td>
                    <td className="py-1.5 pr-2"><Input type="number" step="100" min="0" value={v.market_price ?? ""} onChange={(ev) => edit(r.slug, { market_price: ev.target.value === "" ? null : Number(ev.target.value) })} className={cn("h-8 w-28", changed("market_price") && "border-amber-500")} placeholder="—" /></td>
                    <td className="py-1.5"><Checkbox checked={v.active} onCheckedChange={(c) => edit(r.slug, { active: c === true })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

/* ---------------------------------------------- add category / sub-category */

const GENDER_OPTIONS = [
  { code: "men", name: "Men" }, { code: "women", name: "Women" }, { code: "teenage", name: "Teenage" },
  { code: "kid", name: "Kid" }, { code: "toddler", name: "Toddler" }, { code: "infant", name: "Infant" },
];

const MEASURE_LABELS: Record<string, string> = { top: "Top · chest, length", bottom: "Bottom · waist, inseam", dress: "Dress · bust, waist, length", outer: "Outerwear · chest, length, sleeve", kids_top: "Kids top · height, chest", kids_bottom: "Kids bottom · height, waist" };

function AddForms({ onAdded, onError }: { onAdded: (text: string) => void; onError: (text: string) => void }) {
  const [open, setOpen] = useState<"sub" | null>(null);
  const [busy, setBusy] = useState(false);
  const [sc, setSc] = useState({ name: "", gender: "men", weight_kg: "", profile_code: "fast", value_index: "1.00", measure_type: "top", code: "" });

  async function addSub() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sub-categories", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: sc.name, gender: sc.gender, weight_kg: Number(sc.weight_kg), profile_code: sc.profile_code, value_index: Number(sc.value_index), measure_type: sc.measure_type, code: sc.code || undefined }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      onAdded(`Added ${j.sub_category.name} (code ${j.sub_category.code}). It's on the tag form now.`);
      setSc((x) => ({ ...x, name: "", weight_kg: "", code: "" }));
      setOpen(null);
    } catch (e) { onError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Add a category</span>
          <Button size="sm" variant={open === "sub" ? "default" : "outline"} onClick={() => setOpen(open === "sub" ? null : "sub")}>+ Category</Button>
        </CardTitle>
      </CardHeader>
      {open === "sub" && (
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5"><Label>Gender</Label><select value={sc.gender} onChange={(e) => setSc({ ...sc, gender: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{GENDER_OPTIONS.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}</select></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label>Category name</Label><Input value={sc.name} onChange={(e) => setSc({ ...sc, name: e.target.value })} placeholder="e.g. Cargo pants" /></div>
          <div className="grid gap-1.5"><Label>Default weight kg</Label><Input type="number" step="0.01" min="0.01" value={sc.weight_kg} onChange={(e) => setSc({ ...sc, weight_kg: e.target.value })} placeholder="0.45" /></div>
          <div className="grid gap-1.5"><Label>Profile</Label><select value={sc.profile_code} onChange={(e) => setSc({ ...sc, profile_code: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="fast">Fast</option><option value="standard">Standard</option><option value="slow">Slow</option></select></div>
          <div className="grid gap-1.5"><Label>Value index</Label><Input type="number" step="0.05" min="0.05" value={sc.value_index} onChange={(e) => setSc({ ...sc, value_index: e.target.value })} /></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label>Measurements on the tag</Label><select value={sc.measure_type} onChange={(e) => setSc({ ...sc, measure_type: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(MEASURE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="grid gap-1.5"><Label>SKU code <span className="font-normal text-muted-foreground">· 3 letters, optional</span></Label><Input value={sc.code} maxLength={3} onChange={(e) => setSc({ ...sc, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="auto" className="font-mono uppercase" /></div>
          <div className="sm:col-span-3"><Button disabled={busy || !sc.name.trim() || !(Number(sc.weight_kg) > 0) || !(Number(sc.value_index) > 0)} onClick={addSub}>Add category</Button><span className="ml-3 text-xs text-muted-foreground">Weigh a few pieces for the default weight — it drives the planning estimate.</span></div>
        </CardContent>
      )}
    </Card>
  );
}

/* ------------------------------------------------- selling profiles */

type ProfileRow = { code: string; name: string; pulledShare: number; volFull: number; volMd1: number; volMd2: number; volMd3: number; multiple: number };

function ProfilesEditor() {
  const [rows, setRows] = useState<ProfileRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<ProfileRow>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/profiles").then((r) => r.json()).then((j) => setRows(j.profiles ?? []));
  }, []);
  if (!rows) return <p className="text-muted-foreground">Loading…</p>;

  const v = (r: ProfileRow) => ({ ...r, ...draft[r.code] });
  const sum = (r: ProfileRow) => { const x = v(r); return x.volFull + x.volMd1 + x.volMd2 + x.volMd3; };
  const dirty = Object.keys(draft).length > 0;

  async function save() {
    setBusy(true); setMessage(null);
    const payload = rows!.filter((r) => draft[r.code]).map((r) => { const x = v(r); return { code: r.code, pulled_share: x.pulledShare, vol_full: x.volFull, vol_md1: x.volMd1, vol_md2: x.volMd2, vol_md3: x.volMd3 }; });
    const res = await fetch("/api/admin/profiles", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: payload }) });
    const j = await res.json();
    if (!res.ok) setMessage({ tone: "error", text: j.error }); else { setRows(j.profiles); setDraft({}); setMessage({ tone: "ok", text: "Profiles saved. New tags use the new multiples." }); }
    setBusy(false);
  }

  const Pct = ({ r, k }: { r: ProfileRow; k: keyof ProfileRow }) => (
    <Input type="number" step="0.5" min="0" max="100" value={Math.round((v(r)[k] as number) * 1000) / 10} onChange={(e) => setDraft((d) => ({ ...d, [r.code]: { ...d[r.code], [k]: Number(e.target.value) / 100 } }))} className={cn("h-8 w-20 text-right", draft[r.code]?.[k] !== undefined && "border-amber-500")} />
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Selling profiles <span className="font-normal text-muted-foreground">· what share sells at each rung of the ladder</span></span>
          <span className="flex items-center gap-2">{message && <span className={cn("text-xs", message.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{message.text}</span>}<Button size="sm" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</Button></span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">These are the spec&apos;s open item #1 — estimates until one cycle of real sell-through replaces them. Full + 25% + 50% + 75% must add to 100%; &quot;never sells&quot; is on top and gets pulled at month five. The multiple is recomputed from these, never stored.</p>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Profile</th><th className="pb-2 text-right">Never sells %</th><th className="pb-2 text-right">Full price %</th><th className="pb-2 text-right">25% off</th><th className="pb-2 text-right">50% off</th><th className="pb-2 text-right">75% off</th><th className="pb-2 text-right">Sum</th><th className="pb-2 text-right">Multiple</th></tr></thead>
          <tbody className="divide-y">{rows.map((r) => (
            <tr key={r.code}><td className="py-1.5 font-medium">{r.name}</td>
              <td className="py-1.5 text-right"><Pct r={r} k="pulledShare" /></td><td className="py-1.5 text-right"><Pct r={r} k="volFull" /></td><td className="py-1.5 text-right"><Pct r={r} k="volMd1" /></td><td className="py-1.5 text-right"><Pct r={r} k="volMd2" /></td><td className="py-1.5 text-right"><Pct r={r} k="volMd3" /></td>
              <td className={cn("py-1.5 text-right tabular-nums", Math.abs(sum(r) - 1) > 0.0005 ? "font-semibold text-red-700 dark:text-red-400" : "text-muted-foreground")}>{(sum(r) * 100).toFixed(1)}%</td>
              <td className="py-1.5 text-right font-mono tabular-nums">{r.multiple.toFixed(4)}{draft[r.code] && <span className="ml-1 text-xs text-amber-600">→ save to recompute</span>}</td>
            </tr>))}</tbody>
        </table></div>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------- grades */

type GradeRow = { code: string; name: string; multiplier: number; shareOfIntake: number };

function GradesEditor() {
  const [rows, setRows] = useState<GradeRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<GradeRow>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  useEffect(() => { fetch("/api/admin/grades").then((r) => r.json()).then((j) => setRows(j.grades ?? [])); }, []);
  if (!rows) return <p className="text-muted-foreground">Loading…</p>;
  const v = (r: GradeRow) => ({ ...r, ...draft[r.code] });
  const shareSum = rows.reduce((s, r) => s + v(r).shareOfIntake, 0);
  const dirty = Object.keys(draft).length > 0;
  async function save() {
    setBusy(true); setMessage(null);
    const res = await fetch("/api/admin/grades", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: rows!.filter((r) => draft[r.code]).map((r) => ({ code: r.code, multiplier: v(r).multiplier, share_of_intake: v(r).shareOfIntake })) }) });
    const j = await res.json();
    if (!res.ok) setMessage({ tone: "error", text: j.error }); else { setRows(j.grades); setDraft({}); setMessage({ tone: "ok", text: "Grades saved." }); }
    setBusy(false);
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Condition grades <span className="font-normal text-muted-foreground">· multiplier on the Premium price, and the assumed intake mix</span></span>
          <span className="flex items-center gap-2">{message && <span className={cn("text-xs", message.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{message.text}</span>}<Button size="sm" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</Button></span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Grade</th><th className="pb-2 text-right">× Premium</th><th className="pb-2 text-right">Share of intake %</th></tr></thead>
          <tbody className="divide-y">{rows.map((r) => (
            <tr key={r.code}><td className="py-1.5 font-medium">{r.name}</td>
              <td className="py-1.5 text-right"><Input type="number" step="0.05" min="0" max="5" disabled={r.code === "premium" || r.code === "rejected"} value={v(r).multiplier} onChange={(e) => setDraft((d) => ({ ...d, [r.code]: { ...d[r.code], multiplier: Number(e.target.value) } }))} className={cn("h-8 w-24 text-right", draft[r.code]?.multiplier !== undefined && "border-amber-500")} /></td>
              <td className="py-1.5 text-right"><Input type="number" step="0.5" min="0" max="100" value={Math.round(v(r).shareOfIntake * 1000) / 10} onChange={(e) => setDraft((d) => ({ ...d, [r.code]: { ...d[r.code], shareOfIntake: Number(e.target.value) / 100 } }))} className={cn("h-8 w-24 text-right", draft[r.code]?.shareOfIntake !== undefined && "border-amber-500")} /></td>
            </tr>))}
            <tr><td className="pt-2 text-xs text-muted-foreground">Premium is fixed at 1.00; Rejected at 0.</td><td /><td className={cn("pt-2 text-right text-xs tabular-nums", Math.abs(shareSum - 1) > 0.0005 ? "font-semibold text-red-700 dark:text-red-400" : "text-muted-foreground")}>sum {(shareSum * 100).toFixed(1)}%</td></tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Note({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p className={cn("rounded-md border p-3 text-sm", tone === "ok" ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "border-red-600 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300")}>
      {children}
    </p>
  );
}
