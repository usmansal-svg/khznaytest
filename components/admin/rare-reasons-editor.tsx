"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------- rare-find reasons */

type Reason = { code: string; label: string; tag: string; web: string; sort_order?: number; active?: boolean };

export function RareReasonsEditor() {
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

