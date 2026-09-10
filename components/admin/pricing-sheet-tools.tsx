"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Export the whole Pricing tab (Constants, Selling profiles, Grades,
 * Sub-categories) as one workbook; import it back after editing in Excel.
 * The server only reports differences; nothing is written until Apply,
 * which goes through the same endpoints the screen uses.
 */

type Change = { sheet: string; row: string; field: string; from: string | number | boolean | null; to: string | number | boolean | null };
type Preview = {
  filename: string;
  settings: Record<string, unknown> | null;
  profileRows: Record<string, unknown>[];
  gradeRows: Record<string, unknown>[];
  subRows: Record<string, unknown>[];
  changes: Change[];
  problems: string[];
  matched: number;
  unknown: number;
  sheetsRead: number;
};

const fmt = (v: string | number | boolean | null) => (v == null || v === "" ? "—" : typeof v === "boolean" ? (v ? "yes" : "no") : typeof v === "number" ? v.toLocaleString("en-PK", { maximumFractionDigits: 4 }) : String(v));

export function PricingSheetTools() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pending, setPending] = useState<Preview | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function read(file: File) {
    setReading(true);
    setMessage(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/admin/pricing/sheet", { method: "POST", body });
      const j = await res.json();
      if (!res.ok) setMessage({ tone: "error", text: j.error ?? "Import failed." });
      else setPending({ ...j, filename: file.name });
    } catch {
      setMessage({ tone: "error", text: "Could not upload the file." });
    }
    setReading(false);
  }

  async function apply() {
    if (!pending) return;
    setApplying(true);
    const done: string[] = [];
    const failed: string[] = [];
    const json = async (res: Response) => { try { return await res.json(); } catch { return {}; } };

    // Order matters: grades can rewrite the rejected share as a new settings
    // version, so constants go first and grades after, each on top of the
    // version before it.
    if (pending.settings) {
      const res = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings: pending.settings, note: `Imported from ${pending.filename}` }) });
      const j = await json(res);
      (res.ok ? done : failed).push(res.ok ? "constants" : `constants: ${j.error ?? res.status}`);
    }
    if (pending.profileRows.length) {
      const res = await fetch("/api/admin/profiles", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: pending.profileRows }) });
      const j = await json(res);
      (res.ok ? done : failed).push(res.ok ? "selling profiles" : `selling profiles: ${j.error ?? res.status}`);
    }
    if (pending.gradeRows.length) {
      const res = await fetch("/api/admin/grades", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: pending.gradeRows }) });
      const j = await json(res);
      (res.ok ? done : failed).push(res.ok ? "grades" : `grades: ${j.error ?? res.status}`);
    }
    if (pending.subRows.length) {
      const res = await fetch("/api/admin/sub-categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: pending.subRows }) });
      const j = await json(res);
      const bad = ((j.results ?? []) as { slug: string; ok: boolean; error?: string }[]).filter((r) => !r.ok);
      if (!res.ok && !j.results) failed.push(`sub-categories: ${j.error ?? res.status}`);
      else if (bad.length) failed.push(`sub-categories: ${bad.map((b) => `${b.slug} — ${b.error}`).join("; ")}`);
      else done.push(`${pending.subRows.length} sub-categor${pending.subRows.length === 1 ? "y" : "ies"}`);
    }

    setApplying(false);
    setPending(null);
    if (failed.length) {
      setMessage({ tone: "error", text: `${done.length ? `Saved ${done.join(", ")}. ` : ""}Not saved — ${failed.join(" · ")}` });
    } else {
      // Every tab holds its own copy of the data; a reload is the honest refresh.
      try { sessionStorage.setItem("khz_pricing_import", `Imported ${pending.changes.length} change${pending.changes.length === 1 ? "" : "s"} from ${pending.filename}: ${done.join(", ")}. New tags price with the new values.`); } catch { /* fine */ }
      window.location.reload();
    }
  }

  const [banner] = useState<string | null>(() => {
    try {
      const m = sessionStorage.getItem("khz_pricing_import");
      if (m) sessionStorage.removeItem("khz_pricing_import");
      return m;
    } catch {
      return null;
    }
  });

  const blocked = !pending || applying || pending.problems.length > 0 || pending.changes.length === 0;

  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        {(message || banner) && (
          <span className={cn("text-xs", message?.tone === "error" ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400")}>{message?.text ?? banner}</span>
        )}
        <Button size="sm" variant="outline" asChild>
          <a href="/api/admin/pricing/sheet" download><Download className="mr-1.5 h-4 w-4" />Export Excel</a>
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={reading || applying}>
          <Upload className="mr-1.5 h-4 w-4" />{reading ? "Reading…" : "Import Excel"}
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) void read(f); }} />
      </div>

      {pending && (
        <Card className="w-full border-amber-500 sm:w-[min(90vw,52rem)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              <span>
                Import preview{" "}
                <span className="font-normal text-muted-foreground">
                  · {pending.filename} · {pending.sheetsRead} of 4 sheets read
                  {pending.matched ? ` · ${pending.matched} sub-categories matched` : ""}
                  {pending.unknown ? ` · ${pending.unknown} unknown slug${pending.unknown === 1 ? "" : "s"} ignored` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setPending(null)} disabled={applying}>Cancel</Button>
                <Button size="sm" onClick={apply} disabled={blocked}>{applying ? "Applying…" : `Apply ${pending.changes.length} change${pending.changes.length === 1 ? "" : "s"}`}</Button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-left">
            {pending.problems.length > 0 && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                <p className="mb-1 font-semibold">Fix these in the file and import again — nothing has been saved:</p>
                <ul className="list-disc pl-4">{pending.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            )}
            {pending.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No differences from what is on the screen now.</p>
            ) : (
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="pb-2 pr-3">Sheet</th><th className="pb-2 pr-3">Row</th><th className="pb-2 pr-3">Field</th><th className="pb-2 pr-3 text-right">Now</th><th className="pb-2 text-right">After import</th></tr>
                  </thead>
                  <tbody>
                    {pending.changes.map((c, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-1 pr-3 text-muted-foreground">{c.sheet}</td>
                        <td className="py-1 pr-3">{c.row}</td>
                        <td className="py-1 pr-3 text-muted-foreground">{c.field}</td>
                        <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">{fmt(c.from)}</td>
                        <td className="py-1 text-right font-semibold tabular-nums">{fmt(c.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Constants save as a new settings version noted with the file name; profiles, grades and sub-categories are audited under your name. Every new tag prices with the new values; tagged items keep theirs.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
