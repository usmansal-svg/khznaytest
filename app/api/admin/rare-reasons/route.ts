/**
 * GET   /api/admin/rare-reasons — every reason, active or not, in order
 * PATCH /api/admin/rare-reasons { rows: [{ code, label?, tag_line?, web_text?, active?, sort_order? }] }
 * PUT   /api/admin/rare-reasons { code, label, tag_line, web_text } — add a reason
 */

import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";
import { loadRareReasons } from "@/lib/pricing/rare-reasons";

export const instant = false;

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  return NextResponse.json({ reasons: await loadRareReasons(gate.db, true) });
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function PATCH(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { rows?: { code?: string; label?: string; tag_line?: string; web_text?: string; active?: boolean; sort_order?: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const results: { code: string; ok: boolean; error?: string }[] = [];
  for (const r of body.rows ?? []) {
    const code = clean(r.code, 40);
    if (!code) continue;
    const patch: Record<string, unknown> = {};
    if (r.label !== undefined) { const v = clean(r.label, 40); if (!v) { results.push({ code, ok: false, error: "Label cannot be empty." }); continue; } patch.label = v; }
    if (r.tag_line !== undefined) { const v = clean(r.tag_line, 90); if (!v) { results.push({ code, ok: false, error: "The tag line cannot be empty." }); continue; } patch.tag_line = v; }
    if (r.web_text !== undefined) { const v = String(r.web_text ?? "").trim().slice(0, 600); if (!v) { results.push({ code, ok: false, error: "The web text cannot be empty." }); continue; } patch.web_text = v; }
    if (r.active !== undefined) patch.active = Boolean(r.active);
    if (r.sort_order !== undefined && Number.isInteger(r.sort_order)) patch.sort_order = r.sort_order;
    const { data: before } = await gate.db.from("rare_reasons").select("label, tag_line, web_text, active, sort_order").eq("code", code).maybeSingle();
    if (!before) { results.push({ code, ok: false, error: "Unknown reason." }); continue; }
    const { error } = await gate.db.from("rare_reasons").update(patch).eq("code", code);
    if (error) { results.push({ code, ok: false, error: error.message }); continue; }
    await audit(gate.db, gate.staff.id, "rare_reasons", code, before, { ...before, ...patch });
    results.push({ code, ok: true });
  }
  return NextResponse.json({ results }, { status: results.some((r) => !r.ok) ? 207 : 200 });
}

export async function PUT(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { code?: string; label?: string; tag_line?: string; web_text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const label = clean(body.label, 40);
  const code = clean(body.code, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const tag_line = clean(body.tag_line, 90);
  const web_text = String(body.web_text ?? "").trim().slice(0, 600);
  if (!code || !label || !tag_line || !web_text) return NextResponse.json({ error: "Label, tag line and web text are all required." }, { status: 400 });
  const { count } = await gate.db.from("rare_reasons").select("code", { count: "exact", head: true });
  const { error } = await gate.db.from("rare_reasons").insert({ code, label, tag_line, web_text, sort_order: (count ?? 0) + 1, active: true });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A reason with that name already exists." : error.message }, { status: 400 });
  await audit(gate.db, gate.staff.id, "rare_reasons", code, null, { label, tag_line, web_text }, "Reason added");
  return NextResponse.json({ code });
}
