/**
 * Label printer queue.
 *
 * POST /api/print-jobs  { skus: string[], format?, copies? }  → { jobs: [{id, sku}] }
 * GET  /api/print-jobs?ids=1,2,3                              → { jobs: [{id, sku, status, error, printed_at}] }
 * GET  /api/print-jobs                                        → the last 50 jobs, plus whether the helper has printed recently.
 *
 * The helper on the Mac beside the printer (scripts/print-agent.mts) claims
 * queued jobs and prints them. Nothing here talks to the printer.
 */
import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/staff";
import { TAG_FORMATS } from "@/components/tag-faces";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { skus?: unknown; format?: unknown; copies?: unknown };
  const skus = Array.isArray(body.skus) ? body.skus.map((s) => String(s).trim().toUpperCase()).filter((s) => /^[A-Z0-9-]{3,32}$/.test(s)) : [];
  if (!skus.length) return NextResponse.json({ error: "No SKUs to print." }, { status: 400 });
  const format = TAG_FORMATS.some((f) => f.code === body.format) ? String(body.format) : "label2x1";
  const copies = Math.min(20, Math.max(1, Math.round(Number(body.copies) || 1)));
  const { data: known, error: e1 } = await auth.db.from("items").select("sku").in("sku", skus);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const have = new Set((known ?? []).map((r) => r.sku));
  const missing = skus.filter((s) => !have.has(s));
  if (missing.length) return NextResponse.json({ error: `No garment with SKU ${missing.join(", ")}.` }, { status: 404 });
  const rows = skus.map((sku) => ({ sku, format, copies, requested_by: auth.staff.id }));
  const { data, error } = await auth.db.from("print_jobs").insert(rows).select("id, sku");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}

export async function GET(request: Request) {
  const auth = await requireStaff();
  if ("response" in auth) return auth.response;
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0);
  let q = auth.db.from("print_jobs").select("id, sku, format, copies, status, error, requested_at, printed_at, agent").order("id", { ascending: false });
  q = ids.length ? q.in("id", ids) : q.limit(50);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lastPrint = (data ?? []).find((j) => j.printed_at)?.printed_at ?? null;
  return NextResponse.json({ jobs: data ?? [], last_print_at: lastPrint });
}
