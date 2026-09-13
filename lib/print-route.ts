/**
 * Where "Print" sends a tag on this device: the browser's own print dialog
 * (AirPrint, a USB printer on a laptop) or the label printer helper, a queue
 * the Mac beside the ZYWELL printer drains. Per device, like the paper choice.
 */
export type PrintRoute = "device" | "helper";
export const PRINT_ROUTES: { code: PrintRoute; label: string; hint: string }[] = [
  { code: "helper", label: "Label printer (via the Mac)", hint: "Queued for the helper on the Mac beside the ZYWELL printer. Works from any device." },
  { code: "device", label: "This device's print dialog", hint: "Opens the system print sheet: AirPrint or a printer connected to this computer." },
];
export function readPrintRoute(): PrintRoute {
  try { const v = localStorage.getItem("khz_print_route"); if (v === "device" || v === "helper") return v; } catch { /* fine */ }
  return "helper";
}
export function savePrintRoute(r: PrintRoute) { try { localStorage.setItem("khz_print_route", r); } catch { /* fine */ } }

export type QueuedJob = { id: number; sku: string; status: "queued" | "printing" | "done" | "error"; error?: string | null };

/** Queue tags for the helper. Resolves with the job ids; throws with the server's message. */
export async function queuePrint(skus: string[], format: string, copies = 1): Promise<QueuedJob[]> {
  const r = await fetch("/api/print-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ skus, format, copies }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Could not queue the print.");
  return (j.jobs as { id: number; sku: string }[]).map((x) => ({ ...x, status: "queued" as const }));
}

/** Poll the given jobs until every one is done or failed (or the time is up). Calls back on each change. */
export async function watchJobs(ids: number[], onChange: (jobs: QueuedJob[]) => void, timeoutMs = 60_000): Promise<QueuedJob[]> {
  const started = Date.now();
  let jobs: QueuedJob[] = [];
  while (Date.now() - started < timeoutMs) {
    await new Promise((res) => setTimeout(res, 1500));
    const r = await fetch(`/api/print-jobs?ids=${ids.join(",")}`).catch(() => null);
    if (!r?.ok) continue;
    const j = await r.json();
    jobs = j.jobs as QueuedJob[];
    onChange(jobs);
    if (jobs.every((x) => x.status === "done" || x.status === "error")) break;
  }
  return jobs;
}
