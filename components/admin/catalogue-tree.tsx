"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WEARER_LABELS, WEARER_OPTIONS, type Wearer } from "@/lib/pricing/sku";
import { shopifyTags, shopifyTitle } from "@/lib/shopify/tags";
import { cn } from "@/lib/utils";

/**
 * The catalogue as an editor: gender → category (left) → sub-categories
 * (right). Every node shows the Shopify tag it puts on a garment, so this
 * screen *is* the website menu. Managers add, rename, switch off and delete
 * here; the numbers behind each sub-category stay on Pricing → Categories.
 */

type Sub = { slug: string; code: string; name: string; active: boolean; cost: number | null; items: number; tag: string | null; auto_tag: string | null; custom: boolean };
type Cat = { slug: string; name: string; active: boolean; tag: string; auto_tag: string; custom: boolean; for_wearer: "any" | "girls" | "boys"; subs: Sub[]; items: number };
type Branch = { gender: string; categories: Cat[] };
type Preview = { wearer: Wearer; season: "summer" | "winter"; cat: string; sub: string; brand: string; grade: string; size: string };

const GENDER_LABEL: Record<string, string> = { men: "Men", women: "Women", kid: "Kids (2–8)", teenage: "Teens (9–14)", toddler: "Toddlers (1–2)", infant: "Infants (0–1)" };
const GENDER_TAG: Record<string, string> = { men: "Men", women: "Women", kid: "Kids", teenage: "Teens", toddler: "Toddlers", infant: "Infants" };
/** Inside a child band the boy / girl split is the wearer picked on the tag form; each row also produces these tags. */
const BAND_WEARERS: Record<string, [string, string]> = { kid: ["Kids Boys", "Kids Girls"], teenage: ["Teen Boys", "Teen Girls"], toddler: ["Toddler Boys", "Toddler Girls"], infant: ["Infant Boys", "Infant Girls"] };

export function CatalogueTree() {
  const [tree, setTree] = useState<Branch[] | null>(null);
  const [gender, setGender] = useState("men");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showOff, setShowOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview>({ wearer: "men", season: "summer", cat: "", sub: "", brand: "Nike", grade: "premium", size: "L" });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/catalogue");
    const j = await r.json();
    if (r.ok) setTree(j.tree); else setMsg({ tone: "error", text: j.error });
  }, []);
  useEffect(() => { void load(); try { const g = localStorage.getItem("khz_catalogue_gender"); if (g) setGender(g); } catch { /* fine */ } }, [load]);
  useEffect(() => { if (msg?.tone === "ok") { const t = setTimeout(() => setMsg(null), 6000); return () => clearTimeout(t); } }, [msg]);

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/catalogue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed.");
      setMsg({ tone: "ok", text: (j.hidden ? `${ok.replace(" deleted.", "")} has ${j.count} garment${j.count === 1 ? "" : "s"} tagged under it, so it was hidden rather than deleted. Tick “Show hidden” to restore it.` : ok) + (j.copied_from ? ` Cost Rs ${Math.round(j.cost)} copied from a sibling; tune it on Pricing → Categories.` : j.cost ? ` No sibling to copy from, so the cost is the typical Rs ${Math.round(j.cost)}; set it on Pricing → Categories.` : "") });
      await load();
      return j;
    } catch (e) { setMsg({ tone: "error", text: e instanceof Error ? e.message : "Failed." }); return null; } finally { setBusy(false); }
  }

  const branch = useMemo(() => tree?.find((b) => b.gender === gender) ?? { gender, categories: [] }, [tree, gender]);
  const q = query.trim().toLowerCase();
  const matches = (s: Sub) => !q || s.name.toLowerCase().includes(q) || (s.tag ?? "").toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
  const visibleCats = branch.categories.filter((c) => (showOff || c.active) && (!q || c.name.toLowerCase().includes(q) || c.subs.some(matches)));
  const current = branch.categories.find((c) => c.slug === selected) ?? visibleCats[0] ?? null;
  const live = (c: Cat) => c.subs.filter((s) => s.active).length;
  const totals = { cats: branch.categories.filter((c) => c.active).length, subs: branch.categories.reduce((n, c) => n + live(c), 0) };

  if (!tree) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Catalogue</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Gender → category → sub-category, exactly as the website menu. The code on each row is the tag Shopify receives; build each collection on <i>tag equals</i> that code. Click a code to set your own wording (amber = hand-set).</p>
        </div>
      </div>
      <TagPreview tree={tree} value={preview} onChange={setPreview} />
      {msg && <p className={cn("rounded-lg border px-3 py-2 text-sm", msg.tone === "error" ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200" : "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200")}>{msg.text}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full border bg-background p-1 text-sm">
          {tree.map((b) => (
            <button key={b.gender} type="button" onClick={() => { setGender(b.gender); setSelected(null); try { localStorage.setItem("khz_catalogue_gender", b.gender); } catch { /* fine */ } }} className={cn("rounded-full px-3.5 py-1.5 transition-colors", gender === b.gender ? "bg-foreground font-semibold text-background" : "text-muted-foreground hover:text-foreground")}>
              {GENDER_LABEL[b.gender] ?? b.gender}<span className="ml-1.5 text-xs opacity-60 tabular-nums">{b.categories.filter((c) => c.active).length}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto min-w-[14rem] flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${GENDER_LABEL[gender]} sub-categories or tags`} className="h-9 pl-8" />
          {query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Clear search"><X className="size-4" /></button>}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show hidden</label>
      </div>

      {BAND_WEARERS[gender] && (
        <p className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
          <b>Boys and girls share this catalogue.</b> The tagger picks the wearer on the tag form ({BAND_WEARERS[gender][0].replace(/s$/, "")} or {BAND_WEARERS[gender][1].replace(/s$/, "")}), and every garment then carries the band tag <span className="font-mono text-xs">{GENDER_TAG[gender]} …</span> <i>and</i> the boy or girl tag <span className="font-mono text-xs">{BAND_WEARERS[gender][0]} …</span> / <span className="font-mono text-xs">{BAND_WEARERS[gender][1]} …</span> at category and sub-category level, so the website can have {GENDER_TAG[gender]} → Boys → Hoodies and {GENDER_TAG[gender]} → Girls → Hoodies from the same row.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Left: categories */}
        <div className="rounded-xl border bg-background">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-sm font-semibold">{GENDER_LABEL[gender]} <span className="font-normal text-muted-foreground">· {totals.cats} categories · {totals.subs} sub-categories</span></div>
            <TagCode>{GENDER_TAG[gender]}</TagCode>
          </div>
          <ul className="max-h-[60vh] overflow-auto p-1.5">
            {visibleCats.map((c) => (
              <li key={c.slug}>
                <button type="button" onClick={() => setSelected(c.slug)} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors", current?.slug === c.slug ? "bg-foreground text-background" : "hover:bg-muted", !c.active && "opacity-50")}>
                  <span className="min-w-0 flex-1 truncate">{c.name}{!c.active && <span className="ml-1 text-[10px] uppercase">off</span>}{c.for_wearer !== "any" && <span className={cn("ml-1.5 rounded px-1 text-[10px] uppercase", current?.slug === c.slug ? "bg-background/20" : "bg-muted")}>{c.for_wearer}</span>}</span>
                  <span className={cn("text-xs tabular-nums", current?.slug === c.slug ? "opacity-70" : "text-muted-foreground")}>{q ? c.subs.filter(matches).length : live(c)}</span>
                  <ChevronRight className={cn("size-4 shrink-0", current?.slug === c.slug ? "opacity-70" : "text-muted-foreground")} />
                </button>
              </li>
            ))}
            {visibleCats.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">{q ? "Nothing matches." : "No categories yet."}</li>}
          </ul>
          <div className="border-t p-2">
            <AddRow placeholder={`New category for ${GENDER_LABEL[gender]}, e.g. Suits & Formal`} busy={busy} onAdd={async (name) => { const j = await act({ action: "add_category", gender, name }, `${name} added.`); if (j?.slug) setSelected(j.slug); return Boolean(j); }} />
          </div>
        </div>

        {/* Right: the selected category */}
        <div className="rounded-xl border bg-background">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                <InlineName value={current.name} busy={busy} big onSave={(name) => act({ action: "rename", kind: "category", slug: current.slug, name }, `Renamed to ${name}. Garments tagged from now on carry the new tag.`)} />
                <TagEdit tag={current.tag} auto={current.auto_tag} custom={current.custom} busy={busy} onSave={(tag) => act({ action: "set_tag", kind: "category", slug: current.slug, tag }, tag ? `Tag set to ${tag}.` : "Tag back to automatic.")} />
                {BAND_WEARERS[gender] && <span className="font-mono text-[10px] text-muted-foreground">+ {BAND_WEARERS[gender][0]} {current.tag.replace(/^\S+\s/, "")} · {BAND_WEARERS[gender][1]} {current.tag.replace(/^\S+\s/, "")}</span>}
                <span className="text-xs text-muted-foreground tabular-nums">{live(current)} sub-categories · {current.items.toLocaleString("en-PK")} garments tagged</span>
                <span className="ml-auto flex items-center gap-2">
                  {BAND_WEARERS[gender] && (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Who the tag form offers this category to">Offered to
                      <select value={current.for_wearer} disabled={busy} onChange={(e) => act({ action: "set_for", kind: "category", slug: current.slug, for_wearer: e.target.value }, `${current.name} is offered to ${e.target.value === "any" ? "boys and girls" : e.target.value}.`)} className={cn("h-8 rounded-md border border-input bg-background px-2 text-xs", current.for_wearer !== "any" && "border-amber-500 text-amber-900 dark:text-amber-200")}>
                        <option value="any">Boys and girls</option><option value="girls">Girls only</option><option value="boys">Boys only</option>
                      </select>
                    </label>
                  )}
                  {!current.active && <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => act({ action: "toggle", kind: "category", slug: current.slug, active: true }, `${current.name} restored.`)}>Restore</Button>}
                  <IconButton title={current.subs.length ? "Delete (empty the category first, or switch it off)" : "Delete category"} danger disabled={busy || current.subs.length > 0} onClick={() => { if (window.confirm(`Delete “${current.name}”?`)) void act({ action: "delete", kind: "category", slug: current.slug }, `${current.name} deleted.`).then(() => setSelected(null)); }}><Trash2 className="size-4" /></IconButton>
                </span>
              </div>
              <div className="px-4 pt-3">
                <AddRow placeholder={`Add a sub-category to ${current.name}, e.g. Formal shirt`} busy={busy} autoFocusKey={current.slug} onAdd={async (name) => Boolean(await act({ action: "add_sub", category_slug: current.slug, name }, `${name} added to ${current.name}.`))} />
                <p className="mt-1.5 text-[11px] text-muted-foreground">Press Enter to add. The tag will read “{current.tag.split(" ")[0]} …name…”. Cost, weight and profile are copied from a sibling.</p>
              </div>
              <ul className="divide-y px-2 pb-2 pt-2">
                {current.subs.filter((s) => (showOff || s.active) && matches(s)).map((s) => (
                  <li key={s.slug} className={cn("grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-2 py-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto_auto]", !s.active && "opacity-50")}>
                    <InlineName value={s.name} busy={busy} onSave={(name) => act({ action: "rename", kind: "sub", slug: s.slug, name }, `Renamed to ${name}. Garments tagged from now on carry the new tag.`)} />
                    <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1"><TagEdit tag={s.tag ?? ""} auto={s.auto_tag ?? ""} custom={s.custom} busy={busy} onSave={(tag) => act({ action: "set_tag", kind: "sub", slug: s.slug, tag }, tag ? `Tag set to ${tag}.` : "Tag back to automatic.")} /><span className="text-[11px] text-muted-foreground">SKU {s.code}</span>{BAND_WEARERS[gender] && <span className="w-full font-mono text-[10px] text-muted-foreground sm:w-auto">+ {BAND_WEARERS[gender][0]} {(s.tag ?? "").replace(/^\S+\s/, "")} · {BAND_WEARERS[gender][1]} {(s.tag ?? "").replace(/^\S+\s/, "")}</span>}</div>
                    <div className="text-right text-xs text-muted-foreground tabular-nums" title="Garments tagged under it">{s.items ? `${s.items} tagged` : ""}</div>
                    <div className="flex items-center justify-end gap-1">
                      {!s.active && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => act({ action: "toggle", kind: "sub", slug: s.slug, active: true }, `${s.name} restored.`)}>Restore</Button>}
                      <IconButton title={s.items ? `Delete (${s.items} garments use it, so it will be hidden and kept for them)` : "Delete"} danger disabled={busy} onClick={() => { if (window.confirm(`Delete “${s.name}”?${s.items ? ` ${s.items} garments were tagged under it, so it will be hidden and kept for them.` : ""}`)) void act({ action: "delete", kind: "sub", slug: s.slug }, `${s.name} deleted.`); }}><Trash2 className="size-3.5" /></IconButton>
                    </div>
                  </li>
                ))}
                {current.subs.filter((s) => (showOff || s.active) && matches(s)).length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">{q ? "Nothing matches in this category." : "No sub-categories yet. Add the first one above."}</li>}
              </ul>
            </>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">Pick a category on the left, or add one.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pieces */

function TagCode({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground">{children}</span>;
}

function IconButton({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={cn("rounded p-1 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40", danger ? "text-red-700 hover:text-red-800 dark:text-red-400" : "text-muted-foreground hover:text-foreground")}>{children}</button>;
}

/** The Shopify tag: automatic by default; click to type your own, clear it to go back to automatic. */
function TagEdit({ tag, auto, custom, onSave, busy }: { tag: string; auto: string; custom: boolean; onSave: (tag: string | null) => Promise<unknown>; busy?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag);
  useEffect(() => { setDraft(tag); }, [tag]);
  const save = async () => { const v = draft.trim(); if (v !== tag) await onSave(v && v !== auto ? v : null); setEditing(false); };
  if (editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex items-center gap-1">
        <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setDraft(tag); setEditing(false); } }} placeholder={auto} className="h-7 w-48 font-mono text-xs" />
        <button type="submit" className="rounded p-1 text-green-700 hover:bg-muted" aria-label="Save tag" disabled={busy}><Check className="size-3.5" /></button>
        {custom && <button type="button" className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted" onClick={() => { setDraft(auto); void onSave(null).then(() => setEditing(false)); }}>Automatic</button>}
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Cancel" onClick={() => { setDraft(tag); setEditing(false); }}><X className="size-3.5" /></button>
      </form>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      <button type="button" onClick={() => setEditing(true)} title={custom ? `Hand-set tag (automatic would be “${auto}”). Click to edit.` : "Automatic tag. Click to set your own."} className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-4 hover:border-foreground", custom ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-muted text-muted-foreground")}>{tag}</button>
      <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Edit Shopify tag" title="Edit Shopify tag"><Pencil className="size-3" /></button>
    </span>
  );
}

/** Click the pencil (or the name) to edit in place; Enter saves, Escape cancels. */
function InlineName({ value, onSave, busy, big }: { value: string; onSave: (name: string) => Promise<unknown>; busy?: boolean; big?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const save = async () => { const v = draft.trim(); if (v && v !== value) await onSave(v); setEditing(false); };
  if (editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex min-w-0 items-center gap-1">
        <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value); setEditing(false); } }} className={cn("h-8", big ? "w-64 text-base font-semibold" : "w-48 text-sm")} />
        <button type="submit" className="rounded p-1 text-green-700 hover:bg-muted" aria-label="Save" disabled={busy}><Check className="size-4" /></button>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Cancel" onClick={() => { setDraft(value); setEditing(false); }}><X className="size-4" /></button>
      </form>
    );
  }
  return (
    <span className="group flex min-w-0 items-center gap-1">
      <button type="button" onClick={() => setEditing(true)} className={cn("min-w-0 truncate text-left hover:underline", big ? "text-lg font-semibold" : "text-sm")} title="Click to rename">{value}</button>
      <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Rename ${value}`} title="Edit name"><Pencil className="size-3.5" /></button>
    </span>
  );
}

/** One input, Enter to add, clears itself on success. */
function AddRow({ placeholder, onAdd, busy, autoFocusKey }: { placeholder: string; onAdd: (name: string) => Promise<boolean>; busy?: boolean; autoFocusKey?: string }) {
  const [name, setName] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setName(""); }, [autoFocusKey]);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; if (await onAdd(name.trim())) { setName(""); ref.current?.focus(); } }} className="flex items-center gap-2">
      <div className="relative flex-1">
        <Plus className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input ref={ref} value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} className="h-9 pl-8" />
      </div>
      <Button type="submit" size="sm" className="h-9" disabled={busy || !name.trim()}>Add</Button>
    </form>
  );
}

/** Try a garment: pick what the tagger would pick and see every tag Shopify will receive. */
function TagPreview({ tree, value, onChange }: { tree: Branch[]; value: Preview; onChange: (v: Preview) => void }) {
  const cats = tree.flatMap((b) => b.categories.filter((c) => c.active && c.for_wearer !== (/_boy$/.test(value.wearer) ? "girls" : /_girl$/.test(value.wearer) ? "boys" : "")).map((c) => ({ ...c, gender: b.gender })));
  const cat = cats.find((c) => c.slug === value.cat) ?? cats[0];
  const subs = cat ? cat.subs.filter((s) => s.active) : [];
  const sub = subs.find((s) => s.slug === value.sub) ?? subs[0];
  const set = (patch: Partial<Preview>) => onChange({ ...value, ...patch });
  const item = cat && sub ? { wearer: value.wearer, season: value.season, category: cat.name, sub_category: sub.name, brand: value.brand || null, brand_tier: "regular", grade: value.grade, size_label: value.size || null, colour: null, fabric: null, is_rare: false, category_tag: cat.custom ? cat.tag : null, sub_tag: sub.custom ? sub.tag : null } : null;
  const tags = item ? shopifyTags(item) : [];
  const menu = new Set(cat && sub ? [cat.tag, sub.tag ?? ""] : []);
  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-4">
      <div className="mb-3"><span className="font-semibold">Try a garment</span> <span className="text-xs text-muted-foreground">· pick what the tagger would pick; every tag Shopify receives is listed below</span></div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">Wearer<select className={sel} value={value.wearer} onChange={(e) => set({ wearer: e.target.value as Wearer })}>{WEARER_OPTIONS.map((w) => <option key={w} value={w}>{WEARER_LABELS[w]}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Season<select className={sel} value={value.season} onChange={(e) => set({ season: e.target.value as "summer" | "winter" })}><option value="summer">Summer</option><option value="winter">Winter</option></select></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Category<select className={sel} value={cat?.slug ?? ""} onChange={(e) => set({ cat: e.target.value, sub: "" })}>{cats.map((c) => <option key={c.slug} value={c.slug}>{GENDER_LABEL[c.gender]} · {c.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Sub-category<select className={sel} value={sub?.slug ?? ""} onChange={(e) => set({ sub: e.target.value })}>{subs.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Brand<Input value={value.brand} onChange={(e) => set({ brand: e.target.value })} className="h-9 w-28" /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Condition<select className={sel} value={value.grade} onChange={(e) => set({ grade: e.target.value })}><option value="bnwt">BNWT</option><option value="premium">Premium</option><option value="excellent">Excellent</option><option value="very_good">Very Good</option></select></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Size<Input value={value.size} onChange={(e) => set({ size: e.target.value })} className="h-9 w-16" /></label>
      </div>
      {item && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">Shopify title: <b>{shopifyTitle(item)}</b></p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => <span key={t} className={cn("rounded-md border px-2 py-0.5 font-mono text-xs", menu.has(t) ? "border-foreground bg-foreground text-background" : /^(Men|Women|Kids|Unisex|Teens|Toddlers|Infants)$/.test(t) || /^(Men|Women|Kids) /.test(t) || /^(Summer|Winter)/.test(t) ? "border-sky-500 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200" : "bg-background text-muted-foreground")}>{t}</span>)}
          </div>
          <p className="text-xs text-muted-foreground">Black = the two menu tags from the tree · blue = gender, season and band tags for collections · grey = brand, condition, size and other filters. {tags.length} tags in all.</p>
        </div>
      )}
    </div>
  );
}
