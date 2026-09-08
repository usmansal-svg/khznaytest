/**
 * GET   /api/admin/sub-categories — all rows for the editor
 * PATCH /api/admin/sub-categories — { rows: [{ slug, weight_kg?, profile_code?, value_index?, market_ceiling?, market_price?, per_piece_cost?, per_piece_share?, active? }] }
 *
 * Weights are open item #1 in the spec: every price traces back to them.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { audit, requireManager } from "@/lib/admin/auth";

const PROFILES = ["fast", "standard", "slow"];
const EDITABLE = ["weight_kg", "profile_code", "value_index", "market_ceiling", "market_price", "per_piece_cost", "per_piece_share", "active"] as const;

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sub_categories")
    .select("slug, code, category_slug, name, weight_kg, profile_code, value_index, measure_type, market_ceiling, market_price, per_piece_cost, per_piece_share, active, categories(name, sort_order)")
    .order("slug");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name: string; sort_order: number } | null;
  const rows = (data ?? [])
    .map((r) => ({ ...r, category: one(r.categories)?.name ?? "", category_order: one(r.categories)?.sort_order ?? 0, categories: undefined }))
    .sort((a, b) => a.category_order - b.category_order || a.name.localeCompare(b.name));
  return NextResponse.json({ rows });
}

export async function PATCH(request: Request) {
  let body: { rows?: Record<string, unknown>[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) return NextResponse.json({ error: "rows is required." }, { status: 400 });

  const supabase = await createClient();
  const gate = await requireManager(supabase);
  if ("response" in gate) return gate.response;

  const results: { slug: string; ok: boolean; error?: string }[] = [];
  for (const row of body.rows) {
    const slug = String(row.slug ?? "");
    const patch: Record<string, unknown> = {};
    for (const k of EDITABLE) if (k in row) patch[k] = row[k];

    const err = check(patch);
    if (err) {
      results.push({ slug, ok: false, error: err });
      continue;
    }

    const { data: before } = await supabase
      .from("sub_categories")
      .select("weight_kg, profile_code, value_index, market_ceiling, market_price, per_piece_cost, per_piece_share, active")
      .eq("slug", slug)
      .maybeSingle();
    if (!before) {
      results.push({ slug, ok: false, error: "Unknown sub-category." });
      continue;
    }
    const { error } = await supabase.from("sub_categories").update(patch).eq("slug", slug);
    if (error) {
      results.push({ slug, ok: false, error: error.message });
      continue;
    }
    await audit(supabase, gate.staff.id, "sub_categories", slug, before, { ...before, ...patch });
    results.push({ slug, ok: true });
  }
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({ results }, { status: failed.length ? 207 : 200 });
}

function check(p: Record<string, unknown>): string | null {
  if ("weight_kg" in p && !(typeof p.weight_kg === "number" && p.weight_kg > 0 && p.weight_kg <= 10)) return "weight_kg must be between 0 and 10.";
  if ("value_index" in p && !(typeof p.value_index === "number" && p.value_index > 0 && p.value_index <= 5)) return "value_index must be between 0 and 5.";
  if ("profile_code" in p && !PROFILES.includes(String(p.profile_code))) return "profile_code must be fast, standard or slow.";
  for (const k of ["market_ceiling", "market_price", "per_piece_cost"] as const) {
    if (k in p && p[k] !== null && !(typeof p[k] === "number" && (p[k] as number) >= 0)) return `${k} must be a non-negative number or empty.`;
  }
  if ("per_piece_share" in p && !(typeof p.per_piece_share === "number" && p.per_piece_share >= 0 && p.per_piece_share <= 1)) return "per_piece_share must be between 0 and 1.";
  if ("active" in p && typeof p.active !== "boolean") return "active must be true or false.";
  return null;
}
