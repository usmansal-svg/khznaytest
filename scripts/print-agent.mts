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
 * queue named below (lpstat -p to list). Override with PRINT_QUEUE / CHROME.
 */
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TAG_FORMATS, TagFaces, tagCss, type TagFormat, type TagItem } from "../components/tag-faces";
import { toSvg } from "../lib/barcode/code128";
import { qrSvg } from "../lib/barcode/qr";
import { loadRareReasons, rareTagLine } from "../lib/pricing/rare-reasons";

const run = promisify(execFile);
const QUEUE = process.env.PRINT_QUEUE ?? "EML_400L_LABEL";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const AGENT = `${os.hostname()}:${process.pid}`;
const TAILWIND = "https://cdn.tailwindcss.com";

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
  return `<!doctype html><html><head><meta charset="utf-8"><script src="${TAILWIND}"></script><style>${tagCss(format)} body{margin:0}</style></head><body>${body}</body></html>`;
}

async function printJob(job: { id: number; sku: string; format: string; copies: number }) {
  const format = (TAG_FORMATS.some((f) => f.code === job.format) ? job.format : "label2x1") as TagFormat;
  const paper = TAG_FORMATS.find((f) => f.code === format)!;
  const item = await loadItem(job.sku);
  const file = path.join(tmp, `${job.id}-${job.sku}`);
  fs.writeFileSync(`${file}.html`, await html(item, format));
  await run(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=4000", `--print-to-pdf=${file}.pdf`, `file://${file}.html`], { timeout: 30_000 });
  const media = `Custom.${Math.round((paper.w * 72) / 25.4)}x${Math.round((paper.h * 72) / 25.4)}`;
  await run("lp", ["-d", QUEUE, "-n", String(job.copies), "-o", `media=${media}`, "-t", `Tag ${job.sku}`, `${file}.pdf`], { timeout: 30_000 });
  fs.rmSync(`${file}.html`, { force: true }); fs.rmSync(`${file}.pdf`, { force: true });
}

async function tick() {
  const { data: queued, error } = await db.from("print_jobs").select("id, sku, format, copies").eq("status", "queued").order("id").limit(10);
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
for (;;) { await tick().catch((e) => log("tick failed:", (e as Error).message)); await new Promise((r) => setTimeout(r, 2000)); }
