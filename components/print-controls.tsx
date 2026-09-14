"use client";

import { useEffect, useState } from "react";

import { TAG_FORMATS, saveTagFormat, type TagFormat } from "@/components/tag-faces";
import { PRINT_ROUTES, listPrinters, queuePrint, readPrintRoute, readPrinter, savePrintRoute, savePrinter, watchJobs, type LabelPrinter, type PrintRoute } from "@/lib/print-route";

/** The Print button plus the per-device printer and paper choices, shared by the single and batch print pages. */
export function PrintControls({ skus, format, setFormat }: { skus: string[]; format: TagFormat; setFormat: (f: TagFormat) => void }) {
  const [route, setRoute] = useState<PrintRoute>("helper");
  const [printers, setPrinters] = useState<LabelPrinter[]>([]);
  const [printer, setPrinter] = useState("");
  useEffect(() => { setRoute(readPrintRoute()); setPrinter(readPrinter()); void listPrinters().then(setPrinters); }, []);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function go() {
    if (route === "device") { window.print(); return; }
    setBusy(true); setNote("Queuing…");
    queuePrint(skus, format)
      .then((jobs) => { setNote(`Queued ${jobs.length} for the label printer…`); return watchJobs(jobs.map((j) => j.id), (js) => { const done = js.filter((j) => j.status === "done").length; const bad = js.filter((j) => j.status === "error"); setNote(bad.length ? `Failed: ${bad.map((j) => `${j.sku} (${j.error ?? "error"})`).join(", ")}` : done === js.length ? (js.length === 1 ? "Printed ✓" : `Printed ${done} ✓`) : `Printed ${done} of ${js.length}…`); }); })
      .then((jobs) => { if (jobs.length && !jobs.every((j) => j.status === "done" || j.status === "error")) setNote("Still queued: is the helper on the Mac running?"); })
      .catch((e: Error) => setNote(e.message))
      .finally(() => setBusy(false));
  }
  return (
    <>
      <button onClick={go} disabled={busy} className="rounded-md bg-black px-4 py-2 font-semibold text-white disabled:opacity-60">{busy ? "Printing…" : skus.length === 1 ? "Print tag" : `Print ${skus.length} tags`}</button>
      <label className="flex items-center gap-1.5 text-neutral-600">Printer
        <select value={route} onChange={(e) => { const r = e.target.value as PrintRoute; setRoute(r); savePrintRoute(r); }} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black">
          {PRINT_ROUTES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
      </label>
      {route === "helper" && printers.length > 0 && (
        <label className="flex items-center gap-1.5 text-neutral-600">Which
          <select value={printer} onChange={(e) => { setPrinter(e.target.value); savePrinter(e.target.value); }} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black">
            <option value="">Any printer</option>
            {printers.map((p) => <option key={p.name} value={p.name}>{p.name}{p.online ? "" : " (offline)"}</option>)}
          </select>
        </label>
      )}
      <label className="flex items-center gap-1.5 text-neutral-600">Paper
        <select value={format} onChange={(e) => { const f = e.target.value as TagFormat; setFormat(f); saveTagFormat(f); }} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black">
          {TAG_FORMATS.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
        </select>
      </label>
      {note && <span className={note.startsWith("Failed") || note.startsWith("Still") ? "text-red-700" : "text-neutral-700"}>{note}</span>}
    </>
  );
}
