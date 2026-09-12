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
import { SETTINGS_FIELDS } from "@/lib/pricing/settings-fields";
import { PricingSheetTools } from "@/components/admin/pricing-sheet-tools";
import { HeaderFilter } from "@/components/header-filter";

type SettingsResponse = { settings: Settings; version: number; source: string; history: { version: number; note: string | null; created_at: string; by: string | null }[]; audits: { id: number; table: string; key: string; at: string; by: string; note: string | null; changes: { field: string; from: string; to: string }[] }[]; warning?: string };
type Preview = { rows: { slug: string; name: string; profile: string; weight_kg: number; current: number; proposed: number; change_pct: number }[]; multiples: { profile: string; current: number; proposed: number }[] };
type Est = { landed_cost: number; loaded_cost: number; bnwt: number; premium: number; excellent: number; very_good: number; gp_pct: number; effective_gp_pct: number };
type SubRow = { slug: string; code: string; name: string; gender: string; category_slug: string; category: string; weight_kg: number; profile_code: string; value_index: number; season: "summer" | "winter" | "all"; market_ceiling: number | null; market_price: number | null; standard_cost_pkr: number | null; heavy_cost_pkr: number | null; active: boolean; estimate?: Est | null };

const SEASON_LABEL: Record<string, string> = { summer: "Summer", winter: "Winter", all: "All year" };
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

const FIELDS = SETTINGS_FIELDS;

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
        <PricingSheetTools />
      </div>
      {loaded.warning && <Note tone="error">{loaded.warning}</Note>}

      <Tabs defaultValue="constants">
        <TabsList>
          <TabsTrigger value="constants">Constants</TabsTrigger>
          <TabsTrigger value="profiles">Selling profiles</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
          <TabsTrigger value="subcategories">Categories</TabsTrigger>
          <TabsTrigger value="rare">Rare finds</TabsTrigger>
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
                  {g === "Control" && (
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="outletMinGrade">Lowest condition for outlets</Label>
                      <select id="outletMinGrade" value={draft.outletMinGrade} onChange={(e) => setDraft({ ...draft, outletMinGrade: e.target.value as Settings["outletMinGrade"] })} className={cn("h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm", draft.outletMinGrade !== loaded.settings.outletMinGrade && "border-amber-500")}>
                        <option value="bnwt">Brand New with Tags only</option>
                        <option value="premium">Premium and above</option>
                        <option value="excellent">Excellent and above</option>
                        <option value="very_good">Very Good and above (everything)</option>
                      </select>
                      <p className="text-xs text-muted-foreground">A garment tagged for the outlet channel below this condition is still tagged and priced, but saved as online stock: the tagger is told to put it on the Online rail, and transfers refuse it.</p>
                    </div>
                  )}
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

        <TabsContent value="rare">
          <RareReasonsEditor />
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
  const [targetGp, setTargetGp] = useState<number | null>(null);
  const [cats, setCats] = useState<{ slug: string; name: string; gender: string }[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<SubRow>>>({});
  const [live, setLive] = useState<Record<string, { estimate: Est | null }>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/sub-categories").then((r) => r.json()).then((j) => { setRows(j.rows); setTargetGp(j.basis?.target_gp ?? null); });
    fetch("/api/admin/categories").then((r) => r.json()).then((j) => setCats((j.categories ?? []).filter((c: { active: boolean }) => c.active)));
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

  // Excel-style column filters on gender, category and sub-category.
  const [filters, setFilters] = useState<{ gender: Set<string>; category: Set<string>; name: Set<string>; season: Set<string> }>({ gender: new Set(), category: new Set(), name: new Set(), season: new Set() });

  if (!rows) return <p className="text-muted-foreground">Loading…</p>;
  const dirty = Object.keys(edits).length;
  const pass = (r: SubRow, skip?: "gender" | "category" | "name" | "season") =>
    (skip === "season" || !filters.season.size || filters.season.has(r.season)) &&
    (skip === "gender" || !filters.gender.size || filters.gender.has(r.gender)) &&
    (skip === "category" || !filters.category.size || filters.category.has(r.category)) &&
    (skip === "name" || !filters.name.size || filters.name.has(r.name));
  const visible = rows.filter((r) => pass(r));
  // Each list offers the values still reachable under the other two filters, as Excel does.
  const genderValues = [...new Set(rows.filter((r) => pass(r, "gender")).map((r) => r.gender))].sort((a, b) => GENDER_OPTIONS.findIndex((g) => g.code === a) - GENDER_OPTIONS.findIndex((g) => g.code === b));
  const categoryValues = [...new Set(rows.filter((r) => pass(r, "category")).map((r) => r.category))].sort();
  const nameValues = [...new Set(rows.filter((r) => pass(r, "name")).map((r) => r.name))].sort();
  const filtering = filters.gender.size + filters.category.size + filters.name.size + filters.season.size > 0;

  return (
    <div className="space-y-6">
    <AddForms cats={cats} onAdded={async (text) => { setMessage({ tone: "ok", text }); setRows((await (await fetch("/api/admin/sub-categories")).json()).rows); setCats(((await (await fetch("/api/admin/categories")).json()).categories ?? []).filter((c: { active: boolean }) => c.active)); }} onError={(text) => setMessage({ tone: "error", text })} />
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Sub-categories <span className="font-normal text-muted-foreground">· weight drives cost, profile drives the multiple, value index corrects the rest</span></span>
          <span className="flex items-center gap-2">
            {message && <span className={cn("text-xs", message.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{message.text}</span>}
            <Button size="sm" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : `Save ${dirty || ""} change${dirty === 1 ? "" : "s"}`}</Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground"><strong>Cost per piece</strong> is what a garment costs you <strong>before sales tax</strong>, duty included — enter it that way whether the vendor charged tax or not. <strong>Landed</strong> adds the non-recoverable part of input tax and the sorting cost. <strong>Loaded</strong> then spreads every constant and the selling profile onto the one garment that sells at Premium — markdowns, grade mix, never-sells, rejects, bulk recovery and the target GP — so Premium ex tax is loaded ÷ (1 − target GP). The value index and grades give the four shelf prices, and <strong>Effective GP</strong> is the real margin per garment bought after all of that (it sits at the target, moved only by rounding and the value index). A <strong>market price</strong> sets the Premium price directly (the other grades follow it); clear it to return to the calculation. Everything updates as you type, in amber until you press Save. Weights are the spec&apos;s open item #1 — weigh 20 pieces per category and replace the estimates. Click a column heading to filter the list the way Excel does. <strong>Effective GP</strong> is green at or above your target gross profit and red below it.</p>
        {filtering && <p className="mb-2 text-xs"><span className="text-muted-foreground">Showing {visible.length} of {rows.length} sub-categories.</span> <button type="button" className="ml-2 underline" onClick={() => setFilters({ gender: new Set(), category: new Set(), name: new Set(), season: new Set() })}>Clear filters</button></p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2"><HeaderFilter label="Gender" values={genderValues} selected={filters.gender} onChange={(v) => setFilters((f) => ({ ...f, gender: v }))} format={(g) => GENDER_OPTIONS.find((o) => o.code === g)?.name ?? g} /></th>
                <th className="pb-2"><HeaderFilter label="Category" values={categoryValues} selected={filters.category} onChange={(v) => setFilters((f) => ({ ...f, category: v }))} /></th>
                <th className="pb-2"><HeaderFilter label="Sub-category" values={nameValues} selected={filters.name} onChange={(v) => setFilters((f) => ({ ...f, name: v }))} /></th>
                <th className="pb-2">Code</th><th className="pb-2"><HeaderFilter label="Season" values={["summer", "winter", "all"]} selected={filters.season} onChange={(v) => setFilters((f) => ({ ...f, season: v }))} format={(v) => SEASON_LABEL[v] ?? v} /></th><th className="pb-2">Cost per piece Rs</th><th className="pb-2" title="Optional second cost for the heavy version of this garment; the tag form then offers Light / Heavy. Same website tag either way.">Heavy cost Rs</th><th className="pb-2">Profile</th><th className="pb-2">Value index</th><th className="pb-2">Market price → Premium</th><th className="pb-2 text-right" title="Real margin per garment bought: revenue after markdowns, grade mix, never-sells and rejects, plus bulk recovery, ex tax, against landed cost.">Effective GP %</th><th className="pb-2 text-right">Landed</th><th className="pb-2 text-right" title="Landed cost with markdowns, grade mix, never-sells, rejects and bulk recovery spread onto the garment that sells at Premium. Premium ex tax = loaded ÷ (1 − target GP).">Loaded</th><th className="pb-2 text-right">BNWT</th><th className="pb-2 text-right">Premium</th><th className="pb-2 text-right">Excellent</th><th className="pb-2 text-right">Very Good</th><th className="pb-2">Active</th></tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((r) => {
                const e = edits[r.slug] ?? {};
                const v = { ...r, ...e };
                const changed = (k: keyof SubRow) => k in e;
                const lv = live[r.slug];
                const est = lv ? lv.estimate : r.estimate;
                const previewing = Boolean(lv);
                const num = cn("py-1.5 pr-2 text-right tabular-nums", previewing && "text-amber-700 dark:text-amber-400");
                return (
                  <tr key={r.slug} className={cn(!v.active && "opacity-50")}>
                    <td className="py-1.5 pr-2 text-xs capitalize text-muted-foreground">{r.gender}</td>
                    <td className="py-1.5 pr-2 text-sm">{r.category}</td>
                    <td className="py-1.5 pr-2"><Input value={v.name} onChange={(ev) => edit(r.slug, { name: ev.target.value })} className={cn("h-8 w-44", changed("name") && "border-amber-500")} /></td>
                    <td className="py-1.5 pr-2 font-mono text-xs">{r.code}</td>
                    <td className="py-1.5 pr-2">
                      <select value={v.season} onChange={(ev) => edit(r.slug, { season: ev.target.value as SubRow["season"] })} className={cn("h-8 rounded-md border border-input bg-transparent px-2 text-sm", changed("season") && "border-amber-500")}>
                        <option value="summer">Summer</option><option value="winter">Winter</option><option value="all">All year</option>
                      </select>
                    </td>
                    <td className="py-1.5 pr-2"><Input type="number" step="10" min="1" value={v.standard_cost_pkr ?? ""} placeholder="set me" onChange={(ev) => edit(r.slug, { standard_cost_pkr: ev.target.value === "" ? null : Number(ev.target.value) })} className={cn("h-8 w-28", changed("standard_cost_pkr") && "border-amber-500", !v.standard_cost_pkr && "border-amber-500")} /></td>
                    <td className="py-1.5 pr-2"><Input type="number" step="10" min="1" value={v.heavy_cost_pkr ?? ""} placeholder="—" onChange={(ev) => edit(r.slug, { heavy_cost_pkr: ev.target.value === "" ? null : Number(ev.target.value) })} className={cn("h-8 w-24", changed("heavy_cost_pkr") && "border-amber-500")} /></td>
                    <td className="py-1.5 pr-2">
                      <select value={v.profile_code} onChange={(ev) => edit(r.slug, { profile_code: ev.target.value })} className={cn("h-8 rounded-md border border-input bg-transparent px-2 text-sm", changed("profile_code") && "border-amber-500")}>
                        <option value="fast">Fast</option><option value="standard">Standard</option><option value="slow">Slow</option>
                      </select>
                    </td>
                    <td className="py-1.5 pr-2"><Input type="number" step="0.05" min="0.05" value={v.value_index} onChange={(ev) => edit(r.slug, { value_index: Number(ev.target.value) })} className={cn("h-8 w-24", changed("value_index") && "border-amber-500")} /></td>
                    <td className="py-1.5 pr-2"><Input type="number" step="100" min="0" value={v.market_price ?? ""} onChange={(ev) => edit(r.slug, { market_price: ev.target.value === "" ? null : Number(ev.target.value) })} className={cn("h-8 w-28", changed("market_price") && "border-amber-500")} placeholder="—" /></td>
                    <td className={cn(num, "font-semibold", est && targetGp != null && (est.effective_gp_pct + 1e-9 < targetGp ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"))} title={est ? `${targetGp != null ? `Target ${(targetGp * 100).toFixed(0)}%. ` : ""}Full-price margin on this one garment: ${pct(est.gp_pct)}` : undefined}>{est ? pct(est.effective_gp_pct) : "—"}</td>
                    <td className={cn(num, !previewing && "text-muted-foreground")}>{est ? rs(est.landed_cost) : "—"}</td>
                    <td className={cn(num, !previewing && "text-muted-foreground")}>{est ? rs(est.loaded_cost) : "—"}</td>
                    <td className={num}>{est ? rs(est.bnwt) : "—"}</td>
                    <td className={cn(num, "font-semibold")}>{est ? rs(est.premium) : "—"}</td>
                    <td className={num}>{est ? rs(est.excellent) : "—"}</td>
                    <td className={num}>{est ? rs(est.very_good) : "—"}</td>
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

/* ----------------------------------------------------- rare-find reasons */

type Reason = { code: string; label: string; tag: string; web: string; sort_order?: number; active?: boolean };

function RareReasonsEditor() {
  const [rows, setRows] = useState<Reason[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<{ label: string; tag_line: string; web_text: string }>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [add, setAdd] = useState({ label: "", tag_line: "", web_text: "" });
  const load = () => fetch("/api/admin/rare-reasons").then((r) => r.json()).then((j) => setRows(j.reasons ?? []));
  useEffect(() => { void load(); }, []);
  const edit = (code: string, p: Partial<{ label: string; tag_line: string; web_text: string }>) => setEdits((e) => ({ ...e, [code]: { ...e[code], ...p } }));
  async function save() {
    const payload = Object.entries(edits).map(([code, p]) => ({ code, ...p }));
    if (!payload.length) return;
    setBusy(true); setMessage(null);
    const res = await fetch("/api/admin/rare-reasons", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: payload }) });
    const j = await res.json();
    const failed = ((j.results ?? []) as { code: string; ok: boolean; error?: string }[]).filter((r) => !r.ok);
    setMessage(failed.length ? { tone: "error", text: failed.map((f) => `${f.code}: ${f.error}`).join(" · ") } : { tone: "ok", text: "Saved. New tags and listings use the new wording; garments already tagged keep the reason and pick up the wording when printed or pushed." });
    setEdits({}); await load(); setBusy(false);
  }
  async function toggle(r: Reason) {
    setBusy(true);
    await fetch("/api/admin/rare-reasons", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: [{ code: r.code, active: !r.active }] }) });
    await load(); setBusy(false);
  }
  async function addReason() {
    setBusy(true); setMessage(null);
    const res = await fetch("/api/admin/rare-reasons", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(add) });
    const j = await res.json();
    if (!res.ok) setMessage({ tone: "error", text: j.error ?? "Could not add." });
    else { setMessage({ tone: "ok", text: `Added ${add.label}.` }); setAdd({ label: "", tag_line: "", web_text: "" }); await load(); }
    setBusy(false);
  }
  if (!rows) return <p className="text-muted-foreground">Loading…</p>;
  const dirty = Object.keys(edits).length;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>Rare find reasons <span className="font-normal text-muted-foreground">· what the customer reads</span></span>
            <span className="flex items-center gap-2">
              {message && <span className={cn("text-xs", message.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>{message.text}</span>}
              <Button size="sm" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : `Save ${dirty || ""} change${dirty === 1 ? "" : "s"}`}</Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">The tagger picks <strong>one</strong> reason per rare find. Its <strong>tag line</strong> prints on the outlet tag under the ★ Rare find heading — keep it to about 60 characters so it fits in two lines. Its <strong>web text</strong> opens the Shopify listing under a ★ Rare find heading — three or four lines reads well. Any free text the tagger adds follows both. Switch a reason off to hide it from the form without losing it.</p>
          <div className="grid gap-4">
            {rows.map((r) => {
              const v = { label: r.label, tag_line: r.tag, web_text: r.web, ...edits[r.code] };
              const changed = (k: "label" | "tag_line" | "web_text") => edits[r.code]?.[k] !== undefined;
              return (
                <div key={r.code} className={cn("grid gap-2 rounded-md border p-3 sm:grid-cols-[12rem_1fr]", !r.active && "opacity-60")}>
                  <div className="grid content-start gap-2">
                    <Input value={v.label} onChange={(e) => edit(r.code, { label: e.target.value })} className={cn("h-9 font-medium", changed("label") && "border-amber-500")} />
                    <label className="flex items-center gap-2 text-xs"><Checkbox checked={r.active !== false} disabled={busy} onCheckedChange={() => toggle(r)} /> Shown on the form</label>
                    <span className="font-mono text-[10px] text-muted-foreground">{r.code}</span>
                  </div>
                  <div className="grid gap-2">
                    <div className="grid gap-1">
                      <Label className="text-xs">Tag line <span className="font-normal text-muted-foreground">· {v.tag_line.length}/90</span></Label>
                      <Input value={v.tag_line} maxLength={90} onChange={(e) => edit(r.code, { tag_line: e.target.value })} className={cn("h-9", changed("tag_line") && "border-amber-500")} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">Web text <span className="font-normal text-muted-foreground">· {v.web_text.length}/600</span></Label>
                      <textarea value={v.web_text} maxLength={600} rows={3} onChange={(e) => edit(r.code, { web_text: e.target.value })} className={cn("w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm", changed("web_text") && "border-amber-500")} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Add a reason</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="grid gap-1"><Label htmlFor="rr-label">Label</Label><Input id="rr-label" value={add.label} onChange={(e) => setAdd({ ...add, label: e.target.value })} placeholder="e.g. Designer collaboration" /></div>
          <div className="grid gap-2">
            <div className="grid gap-1"><Label htmlFor="rr-tag">Tag line</Label><Input id="rr-tag" value={add.tag_line} maxLength={90} onChange={(e) => setAdd({ ...add, tag_line: e.target.value })} placeholder="One line for the price tag" /></div>
            <div className="grid gap-1"><Label htmlFor="rr-web">Web text</Label><textarea id="rr-web" value={add.web_text} maxLength={600} rows={3} onChange={(e) => setAdd({ ...add, web_text: e.target.value })} placeholder="Three or four lines for the Shopify listing" className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" /></div>
            <div><Button disabled={busy || !add.label.trim() || !add.tag_line.trim() || !add.web_text.trim()} onClick={addReason}>Add reason</Button></div>
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

function AddForms({ cats, onAdded, onError }: { cats: { slug: string; name: string; gender: string }[]; onAdded: (text: string) => void; onError: (text: string) => void }) {
  const [open, setOpen] = useState<"sub" | "cat" | null>(null);
  const [busy, setBusy] = useState(false);
  const [sc, setSc] = useState({ name: "", gender: "men", category_slug: "", standard_cost: "", profile_code: "fast", value_index: "1.00", measure_type: "top", season: "all", code: "" });
  const [cat, setCat] = useState({ gender: "men", name: "" });
  const catsFor = cats.filter((c) => c.gender === sc.gender);
  useEffect(() => { if (catsFor.length && !catsFor.some((c) => c.slug === sc.category_slug)) setSc((x) => ({ ...x, category_slug: catsFor[0].slug })); }, [catsFor, sc.category_slug]);

  async function addCat() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cat) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      onAdded(`Added category ${j.category.name} under ${cat.gender}.`);
      setCat({ ...cat, name: "" });
      setOpen(null);
    } catch (e) { onError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(false); }
  }

  async function addSub() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sub-categories", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: sc.name, category_slug: sc.category_slug, standard_cost_pkr: Number(sc.standard_cost), profile_code: sc.profile_code, value_index: Number(sc.value_index), measure_type: sc.measure_type, season: sc.season, code: sc.code || undefined }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      onAdded(`Added ${j.sub_category.name} (code ${j.sub_category.code}) under ${cats.find((c) => c.slug === sc.category_slug)?.name}. It's on the tag form now.`);
      setSc((x) => ({ ...x, name: "", standard_cost: "", code: "" }));
      setOpen(null);
    } catch (e) { onError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>Add to the catalogue</span>
          <span className="flex gap-2">
            <Button size="sm" variant={open === "sub" ? "default" : "outline"} onClick={() => setOpen(open === "sub" ? null : "sub")}>+ Sub-category</Button>
            <Button size="sm" variant={open === "cat" ? "default" : "outline"} onClick={() => setOpen(open === "cat" ? null : "cat")}>+ Category</Button>
          </span>
        </CardTitle>
      </CardHeader>
      {open === "sub" && (
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5"><Label>Gender</Label><select value={sc.gender} onChange={(e) => setSc({ ...sc, gender: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{GENDER_OPTIONS.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}</select></div>
          <div className="grid gap-1.5"><Label>Category</Label><select value={sc.category_slug} onChange={(e) => setSc({ ...sc, category_slug: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{catsFor.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}{catsFor.length === 0 && <option value="">Add a category first</option>}</select></div>
          <div className="grid gap-1.5"><Label>Sub-category name</Label><Input value={sc.name} onChange={(e) => setSc({ ...sc, name: e.target.value })} placeholder="e.g. Crop top" /></div>
          <div className="grid gap-1.5"><Label>Standard cost · Rs per garment</Label><Input type="number" step="10" min="1" value={sc.standard_cost} onChange={(e) => setSc({ ...sc, standard_cost: e.target.value })} placeholder="550" /></div>
          <div className="grid gap-1.5"><Label>Profile</Label><select value={sc.profile_code} onChange={(e) => setSc({ ...sc, profile_code: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="fast">Fast</option><option value="standard">Standard</option><option value="slow">Slow</option></select></div>
          <div className="grid gap-1.5"><Label>Value index</Label><Input type="number" step="0.05" min="0.05" value={sc.value_index} onChange={(e) => setSc({ ...sc, value_index: e.target.value })} /></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label>Measurements on the tag</Label><select value={sc.measure_type} onChange={(e) => setSc({ ...sc, measure_type: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{Object.entries(MEASURE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="grid gap-1.5"><Label>SKU code <span className="font-normal text-muted-foreground">· 3 letters, optional</span></Label><Input value={sc.code} maxLength={3} onChange={(e) => setSc({ ...sc, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} placeholder="auto" className="font-mono uppercase" /></div>
          <div className="sm:col-span-3"><Button disabled={busy || !sc.name.trim() || !sc.category_slug || !(Number(sc.standard_cost) > 0) || !(Number(sc.value_index) > 0)} onClick={addSub}>Add sub-category</Button><span className="ml-3 text-xs text-muted-foreground">Standard cost is your average landed cost per garment across vendors — it sets the shelf price.</span></div>
        </CardContent>
      )}
      {open === "cat" && (
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5"><Label>Gender</Label><select value={cat.gender} onChange={(e) => setCat({ ...cat, gender: e.target.value })} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{GENDER_OPTIONS.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}</select></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label>Category name</Label><Input value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} placeholder="e.g. Tops & Blouses" /></div>
          <div className="sm:col-span-3"><Button disabled={busy || !cat.name.trim()} onClick={addCat}>Add category</Button><span className="ml-3 text-xs text-muted-foreground">Then add sub-categories under it — that&apos;s what taggers pick.</span></div>
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
