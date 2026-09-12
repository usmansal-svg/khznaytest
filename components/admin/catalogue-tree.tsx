"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Power, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The catalogue as a family tree: gender → category → sub-category. Every
 * node shows the Shopify tag it puts on a garment, so the tree *is* the
 * website menu. Managers add, rename, switch off and delete here; the
 * numbers behind each sub-category stay on Pricing → Categories.
 */

type Sub = { slug: string; code: string; name: string; active: boolean; cost: number | null; items: number; tag: string | null };
type Cat = { slug: string; name: string; active: boolean; tag: string; subs: Sub[]; items: number };
type Branch = { gender: string; categories: Cat[] };

const GENDER_LABEL: Record<string, string> = { men: "Men", women: "Women", kid: "Kids", teenage: "Teens", toddler: "Toddlers", infant: "Infants" };
const GENDER_TAG: Record<string, string> = { men: "Men", women: "Women", kid: "Kids", teenage: "Kids", toddler: "Kids", infant: "Kids" };

export function CatalogueTree() {
  const [tree, setTree] = useState<Branch[] | null>(null);
  const [gender, setGender] = useState("men");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null); // category slug with the add box open, or "category"
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [showOff, setShowOff] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/catalogue");
    const j = await r.json();
    if (r.ok) setTree(j.tree); else setMsg({ tone: "error", text: j.error });
  }, []);
  useEffect(() => { void load(); try { const g = localStorage.getItem("khz_catalogue_gender"); if (g) setGender(g); } catch { /* fine */ } }, [load]);

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/catalogue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed.");
      setMsg({ tone: "ok", text: ok + (j.copied_from ? ` Numbers copied from a sibling; cost Rs ${Math.round(j.cost)}.` : j.cost ? ` No sibling to copy from — cost set to the typical Rs ${Math.round(j.cost)}; adjust it on Pricing → Categories.` : "") });
      await load();
      return true;
    } catch (e) { setMsg({ tone: "error", text: e instanceof Error ? e.message : "Failed." }); return false; } finally { setBusy(false); }
  }

  const rename = async (kind: "category" | "sub", slug: string, current: string) => {
    const name = window.prompt(`New name for “${current}”. This is also the Shopify tag, so name it the way it should read on the website:`, current);
    if (name == null || !name.trim() || name.trim() === current) return;
    await act({ action: "rename", kind, slug, name }, `Renamed to ${name.trim()}. Garments tagged from now on carry the new tag; already-uploaded products keep the old one until re-uploaded.`);
  };
  const remove = async (kind: "category" | "sub", slug: string, name: string) => {
    if (!window.confirm(`Delete “${name}”? This is only allowed when nothing has been tagged under it.`)) return;
    await act({ action: "delete", kind, slug }, `${name} deleted.`);
  };
  const submitAdd = async () => {
    if (!draft.trim()) return;
    const ok = adding === "category" ? await act({ action: "add_category", gender, name: draft }, `Category ${draft.trim()} added.`) : await act({ action: "add_sub", category_slug: adding, name: draft }, `${draft.trim()} added.`);
    if (ok) { setDraft(""); setAdding(null); }
  };

  if (!tree) return <p className="text-muted-foreground">Loading…</p>;
  const branch = tree.find((b) => b.gender === gender) ?? { gender, categories: [] };
  const live = (c: Cat) => c.subs.filter((s) => s.active).length;
  const totals = { cats: branch.categories.filter((c) => c.active).length, subs: branch.categories.reduce((n, c) => n + live(c), 0), items: branch.categories.reduce((n, c) => n + c.items, 0) };
  const toggleFold = (slug: string) => setClosed((s) => { const n = new Set(s); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Catalogue</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Gender → category → sub-category, exactly as the website menu. The grey code beside each name is the tag the garment carries to Shopify; build each collection on <i>tag equals</i> that code. Costs and weights are on Pricing → Categories.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full border bg-background p-1 text-sm">
            {tree.map((b) => <button key={b.gender} type="button" onClick={() => { setGender(b.gender); try { localStorage.setItem("khz_catalogue_gender", b.gender); } catch { /* fine */ } }} className={cn("rounded-full px-3 py-1", gender === b.gender ? "bg-foreground font-semibold text-background" : "text-muted-foreground hover:text-foreground")}>{GENDER_LABEL[b.gender] ?? b.gender}<span className="ml-1 text-xs opacity-70">{b.categories.filter((c) => c.active).length}</span></button>)}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show switched-off</label>
        </div>
      </div>
      {msg && <p className={cn("rounded-md border p-3 text-sm", msg.tone === "error" ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200" : "bg-muted")}>{msg.text}</p>}

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground tabular-nums">
        <span><b className="text-lg text-foreground">{totals.cats}</b> categories</span>
        <span><b className="text-lg text-foreground">{totals.subs}</b> sub-categories</span>
        <span><b className="text-lg text-foreground">{totals.items.toLocaleString("en-PK")}</b> garments tagged</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-foreground px-4 py-2 text-lg font-bold text-background">{GENDER_LABEL[gender] ?? gender}</span>
        <Tag>{GENDER_TAG[gender]}</Tag>
        {gender !== "men" && gender !== "women" && <span className="text-xs text-muted-foreground">The tag form&apos;s wearer adds Kids Boys / Infant Girls / Teens… on top.</span>}
      </div>

      <div className="ml-5 border-l-2 border-foreground pl-6">
        {branch.categories.filter((c) => showOff || c.active).map((c) => {
          const folded = closed.has(c.slug);
          return (
            <div key={c.slug} className={cn("relative py-2", !c.active && "opacity-60")}>
              <span className="absolute -left-6 top-[1.35rem] h-0.5 w-6 bg-foreground" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => toggleFold(c.slug)} className={cn("inline-flex items-center gap-2 rounded-lg border-2 bg-background px-3 py-1.5 font-semibold", c.active ? "border-foreground" : "border-dashed border-muted-foreground")}>
                  {folded ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}{c.name}<span className="text-xs font-normal text-muted-foreground tabular-nums">{live(c)}</span>
                </button>
                <Tag>{c.tag}</Tag>
                {!c.active && <span className="text-xs text-muted-foreground">switched off</span>}
                <span className="ml-auto flex gap-1">
                  <IconButton title="Rename" onClick={() => rename("category", c.slug, c.name)} disabled={busy}><Pencil className="size-3.5" /></IconButton>
                  <IconButton title={c.active ? "Switch off (hides it and all its sub-categories from the tag form)" : "Switch on"} onClick={() => act({ action: "toggle", kind: "category", slug: c.slug, active: !c.active }, `${c.name} switched ${c.active ? "off" : "on"}.`)} disabled={busy}><Power className="size-3.5" /></IconButton>
                  <IconButton title="Delete (only when empty)" onClick={() => remove("category", c.slug, c.name)} disabled={busy} danger><Trash2 className="size-3.5" /></IconButton>
                </span>
              </div>
              {!folded && (
                <div className="ml-4 mt-2 flex flex-wrap items-center gap-2 border-l border-border pl-5">
                  {c.subs.filter((s) => showOff || s.active).map((s) => (
                    <span key={s.slug} className={cn("group inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm", s.active ? "border-sky-500 bg-sky-50 dark:bg-sky-950" : "border-dashed text-muted-foreground line-through")} title={`${s.tag ?? ""} · code ${s.code} · cost Rs ${s.cost ?? "—"} · ${s.items} tagged`}>
                      {s.name}
                      <span className="font-mono text-[10px] text-muted-foreground no-underline">{s.tag?.replace(new RegExp(`^${GENDER_TAG[gender]} `), "")}</span>
                      {s.items > 0 && <span className="text-[10px] text-muted-foreground tabular-nums">· {s.items}</span>}
                      <span className="ml-1 hidden gap-0.5 group-hover:inline-flex">
                        <IconButton title="Rename" onClick={() => rename("sub", s.slug, s.name)} disabled={busy}><Pencil className="size-3" /></IconButton>
                        <IconButton title={s.active ? "Switch off" : "Switch on"} onClick={() => act({ action: "toggle", kind: "sub", slug: s.slug, active: !s.active }, `${s.name} switched ${s.active ? "off" : "on"}.`)} disabled={busy}><Power className="size-3" /></IconButton>
                        <IconButton title="Delete" onClick={() => remove("sub", s.slug, s.name)} disabled={busy} danger><Trash2 className="size-3" /></IconButton>
                      </span>
                    </span>
                  ))}
                  {adding === c.slug ? (
                    <form onSubmit={(e) => { e.preventDefault(); void submitAdd(); }} className="inline-flex items-center gap-1">
                      <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Formal shirt" className="h-8 w-44" />
                      <Button type="submit" size="sm" className="h-8" disabled={busy || !draft.trim()}>Add</Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setAdding(null); setDraft(""); }}>Cancel</Button>
                    </form>
                  ) : (
                    <button type="button" onClick={() => { setAdding(c.slug); setDraft(""); }} className="inline-flex items-center gap-1 rounded-md border border-dashed px-2.5 py-1 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"><Plus className="size-3.5" /> Add sub-category</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="relative py-2">
          <span className="absolute -left-6 top-[1.35rem] h-0.5 w-6 bg-foreground" aria-hidden />
          {adding === "category" ? (
            <form onSubmit={(e) => { e.preventDefault(); void submitAdd(); }} className="inline-flex items-center gap-1">
              <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Suits & Formal" className="h-9 w-56" />
              <Button type="submit" size="sm" disabled={busy || !draft.trim()}>Add category</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(null); setDraft(""); }}>Cancel</Button>
            </form>
          ) : (
            <button type="button" onClick={() => { setAdding("category"); setDraft(""); }} className="inline-flex items-center gap-2 rounded-lg border-2 border-dashed px-3 py-1.5 font-semibold text-muted-foreground hover:border-foreground hover:text-foreground"><Plus className="size-4" /> Add category to {GENDER_LABEL[gender]}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{children}</span>;
}

function IconButton({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={cn("rounded p-1 hover:bg-muted disabled:opacity-50", danger ? "text-red-700 hover:text-red-800 dark:text-red-400" : "text-muted-foreground hover:text-foreground")}>{children}</button>;
}
