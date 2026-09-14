/**
 * Label printer helper. Runs on the Mac the ZYWELL ZY909 is plugged into.
 *
 * Every 2 s it claims queued rows in `print_jobs`, renders each tag exactly
 * as the print page would (same TagFaces component, same paper sizes) into a
 * PDF with headless Chrome, and hands it to CUPS at the matching paper size.
 * Marks the row done or error so the tagging screen can show it.
 *
 *   npm run print-agent            (or the launch agent installed by scripts/install-print-agent.sh)
 *
 * Needs: .env.local with the service-role key, Google Chrome, and the CUPS
 * queue named below (lpstat -p to list). Environment:
 *   PRINT_QUEUE     CUPS queue name (default EML_400L_LABEL)
 *   PRINT_MODE=zpl  Zebra: send native ZPL for the 2.25 × 1.5 label (raw), no PDF
 *   PRINT_RIBBON=no direct-thermal Zebra (default: thermal transfer, ribbon fitted)
 *   PRINT_POLL_MS   how often to look for jobs (default 400)
 *   PRINTER_NAME    the name the iPads pick (default: the queue name)
 *   PRINT_PAPER     the paper loaded, for the pages to default to (label2x1 / label225x15 / …)
 *   PRINT_SHARE     Windows only: the shared printer to copy ZPL to (default \\localhost\<PRINT_QUEUE>)
 *   PRINT_DEVICE    Linux / Raspberry Pi: the USB printer device to write ZPL to (e.g. /dev/usb/lp0); no CUPS needed
 * Windows: see scripts/print-agent-windows.md.
 */
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import puppeteer, { type Browser } from "puppeteer-core";

import { TAG_FORMATS, TagFaces, tagCss, type TagFormat, type TagItem } from "../components/tag-faces";
import { zplLabel15x225, zplLabel225x15, zplLabel50x50 } from "../lib/print/zpl";
import { toSvg } from "../lib/barcode/code128";
import { qrSvg } from "../lib/barcode/qr";
import { loadRareReasons, rareTagLine } from "../lib/pricing/rare-reasons";

const run = promisify(execFile);
const QUEUE = process.env.PRINT_QUEUE ?? "EML_400L_LABEL";
// PRINT_MODE=zpl sends native Zebra commands (raw) instead of a PDF: no rasterising, label out in about a second.
const ZPL = process.env.PRINT_MODE === "zpl";
const THERMAL_TRANSFER = process.env.PRINT_RIBBON !== "no";
const POLL_MS = Number(process.env.PRINT_POLL_MS ?? 400);
// The printer's name as the iPads see it. Jobs name a printer; unnamed jobs go to whichever helper sees them first.
const NAME = process.env.PRINTER_NAME ?? QUEUE;
// Windows: the printer is shared (Printer properties → Sharing) and raw ZPL is copied to the share, e.g. \\localhost\ZEBRA1.
const WIN = process.platform === "win32";
const SHARE = process.env.PRINT_SHARE ?? (WIN ? `\\\\localhost\\${QUEUE}` : "");
// Linux (Raspberry Pi): write ZPL straight to the USB printer device, no CUPS needed, e.g. PRINT_DEVICE=/dev/usb/lp0.
const DEVICE = process.env.PRINT_DEVICE ?? "";
const PAPER = process.env.PRINT_PAPER ?? (ZPL ? "label225x15" : "label2x1");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const AGENT = `${os.hostname()}:${process.pid}`;
const TAILWIND = "https://cdn.tailwindcss.com";
let tailwindJs: string | null = null; // fetched once, inlined into every label page: no network per label

const env = Object.fromEntries(fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error("print-agent: .env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "khz-print-"));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function loadItem(sku: string): Promise<TagItem> {
  const { data, error } = await db.from("items")
    .select("sku, brand_text, size_label, price, price_manual, is_rare, rare_reasons, rare_note, status, measurements, outlets!items_outlet_id_fkey(name), sub_categories(name, categories(name))")
    .eq("sku", sku).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No garment with SKU ${sku}`);
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const sub = one<{ name: string; categories: unknown }>(data.sub_categories);
  const rareLine = data.is_rare ? rareTagLine(data.rare_reasons ?? [], data.rare_note, await loadRareReasons(db)) : null;
  return {
    sku: data.sku, brand: data.brand_text ?? "Unbranded", category: one<{ name: string }>(sub?.categories)?.name ?? "", sub_category: sub?.name ?? "",
    size_label: data.size_label, measurements: data.measurements ?? {}, measure_fields: [], list_price: data.price_manual ?? data.price ?? 0,
    status: data.status, is_rare: data.is_rare, rare_note: data.rare_note, rare_tag_line: rareLine, outlet: one<{ name: string }>(data.outlets)?.name ?? null,
  };
}

async function html(item: TagItem, format: TagFormat): Promise<string> {
  const uri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const full = uri(toSvg(item.sku, { moduleWidth: 1, height: 36, fontSize: 7 }));
  const bare = uri(toSvg(item.sku, { moduleWidth: 1, height: 36, showText: false, quietZone: 6, stretch: true }));
  const qr = uri(await qrSvg(item.sku));
  const body = renderToStaticMarkup(createElement(TagFaces, { item, format }))
    .replace(/src="\/api\/tags\/[^"]*\/barcode\?bare=1"/g, `src="${bare}"`)
    .replace(/src="\/api\/tags\/[^"]*\/barcode"/g, `src="${full}"`)
    .replace(/src="\/api\/tags\/[^"]*\/qr"/g, `src="${qr}"`);
  if (tailwindJs == null) { try { tailwindJs = await (await fetch(TAILWIND)).text(); } catch { tailwindJs = null; } }
  const tw = tailwindJs ? `<script>${tailwindJs}</script>` : `<script src="${TAILWIND}"></script>`;
  return `<!doctype html><html><head><meta charset="utf-8">${tw}<style>${tagCss(format)} body{margin:0}</style></head><body>${body}</body></html>`;
}

// One Chrome stays open for the PDF route; launching it per label cost 2–4 s.
let browser: Browser | null = null;
async function chrome(): Promise<Browser> {
  if (browser?.connected) return browser;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu", "--no-first-run"] });
  return browser;
}

async function printJob(job: { id: number; sku: string; format: string; copies: number }) {
  const format = (TAG_FORMATS.some((f) => f.code === job.format) ? job.format : "label2x1") as TagFormat;
  const paper = TAG_FORMATS.find((f) => f.code === format)!;
  const item = await loadItem(job.sku);
  const file = path.join(tmp, `${job.id}-${job.sku}`);
  if (ZPL) {
    // The two Zebra papers have native drawings; other papers fall back to the PDF route on the same queue.
    const zpl = format === "label225x15" ? zplLabel225x15 : format === "label15x225" ? zplLabel15x225 : format === "label50x50" ? zplLabel50x50 : null;
    if (zpl) {
      fs.writeFileSync(`${file}.zpl`, zpl(item, { thermalTransfer: THERMAL_TRANSFER, copies: job.copies }));
      if (DEVICE) fs.writeFileSync(DEVICE, fs.readFileSync(`${file}.zpl`));
      else if (WIN) await run("cmd.exe", ["/c", "copy", "/b", `${file}.zpl`, SHARE], { timeout: 30_000, windowsHide: true });
      else await run("lp", ["-d", QUEUE, "-o", "raw", "-t", `Tag ${job.sku}`, `${file}.zpl`], { timeout: 30_000 });
      fs.rmSync(`${file}.zpl`, { force: true });
      return;
    }
  }
  if (WIN || DEVICE) throw new Error("This helper prints Zebra labels only here (PRINT_MODE=zpl, paper 2.25 × 1.5). The PDF route needs the Mac.");
  const page = await (await chrome()).newPage();
  try {
    await page.setContent(await html(item, format), { waitUntil: "load", timeout: 20_000 });
    await new Promise((r) => setTimeout(r, 250)); // Tailwind builds its styles right after load
    await page.pdf({ path: `${file}.pdf`, width: `${paper.w}mm`, height: `${paper.h}mm`, printBackground: true, preferCSSPageSize: true });
  } finally { await page.close(); }
  const media = `Custom.${Math.round((paper.w * 72) / 25.4)}x${Math.round((paper.h * 72) / 25.4)}`;
  await run("lp", ["-d", QUEUE, "-n", String(job.copies), "-o", `media=${media}`, "-t", `Tag ${job.sku}`, `${file}.pdf`], { timeout: 30_000 });
  fs.rmSync(`${file}.pdf`, { force: true });
}

async function tick() {
  const { data: queued, error } = await db.from("print_jobs").select("id, sku, format, copies, printer").eq("status", "queued").or(`printer.eq.${NAME},printer.is.null`).order("id").limit(10);
  if (error) { log("queue read failed:", error.message); return; }
  for (const job of queued ?? []) {
    const { data: claimed } = await db.from("print_jobs").update({ status: "printing", claimed_at: new Date().toISOString(), agent: AGENT }).eq("id", job.id).eq("status", "queued").select("id");
    if (!claimed?.length) continue; // another helper took it
    try {
      await printJob(job);
      await db.from("print_jobs").update({ status: "done", printed_at: new Date().toISOString() }).eq("id", job.id);
      log(`printed #${job.id} ${job.sku} ×${job.copies} (${job.format})`);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      await db.from("print_jobs").update({ status: "error", error: msg }).eq("id", job.id);
      log(`FAILED #${job.id} ${job.sku}: ${msg}`);
    }
  }
}

log(`print-agent up: queue ${QUEUE}, agent ${AGENT}`);
// Anything left "printing" by a helper that died goes back to the queue.
await db.from("print_jobs").update({ status: "queued", agent: null, claimed_at: null }).eq("status", "printing").lt("claimed_at", new Date(Date.now() - 120_000).toISOString());
log(`printer "${NAME}", mode ${ZPL ? "ZPL (native Zebra)" : "PDF"}, ribbon ${THERMAL_TRANSFER ? "yes" : "no"}, paper ${PAPER}, polling every ${POLL_MS} ms`);
// Heartbeat: the print pages list printers seen in the last minute.
const beat = () => db.from("label_printers").upsert({ name: NAME, queue: QUEUE, mode: ZPL ? "zpl" : "pdf", host: os.hostname(), paper: PAPER, last_seen: new Date().toISOString() }).then(({ error: e }) => { if (e) log("heartbeat failed:", e.message); });
await beat(); setInterval(() => void beat(), 15_000);
for (;;) { await tick().catch((e) => log("tick failed:", (e as Error).message)); await new Promise((r) => setTimeout(r, POLL_MS)); }
