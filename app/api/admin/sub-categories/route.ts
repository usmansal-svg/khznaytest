/**
 * GET   /api/admin/sub-categories — all rows for the editor
 * PATCH /api/admin/sub-categories — { rows: [{ slug, weight_kg?, profile_code?, value_index?, market_ceiling?, market_price?, per_piece_cost?, per_piece_share?, active? }] }
 *
 * Weights are open item #1 in the spec: every price traces back to them.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { audit, requireManager } from "@/lib/admin/auth";
import { computePrice } from "@/lib/pricing/engine";
import { loadPricingContext } from "@/lib/pricing/repo";

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
  // Planning estimate, the way the Excel sheet does it: default weight at the
  // planning rate, imported. Real garments price from their lot and scale.
  const ctx = await loadPricingContext(supabase);
  const rows = (data ?? [])
    .map((r) => {
      const est = computePrice({ weightKg: Number(r.weight_kg), profileCode: r.profile_code, valueIndex: Number(r.value_index) }, ctx.settings, ctx.refs);
      return {
        ...r, category: one(r.categories)?.name ?? "", category_order: one(r.categories)?.sort_order ?? 0, categories: undefined,
        estimate: { landed_cost: Math.round(est.landedCost), bnwt: est.gradePrices.bnwt, premium: est.gradePrices.premium, excellent: est.gradePrices.excellent, very_good: est.gradePrices.very_good, gp_pct: est.gpPct },
      };
    })
    .sort((a, b) => a.category_order - b.category_order || a.name.localeCompare(b.name));
  return NextResponse.json({ rows, basis: { planning_rate: ctx.settings.blendedRate, fx: ctx.settings.fx } });
}

/**
 * POST /api/admin/sub-categories?preview=1 { rows: [{ slug, weight_kg?, profile_code?, value_index? }] }
 * Live estimates for draft edits — nothing is saved. Same engine, same
 * settings, so what the screen shows while typing is what Save will give.
 */
export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { rows?: { slug?: string; weight_kg?: number; profile_code?: string; value_index?: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const ctx = await loadPricingContext(gate.db);
  const estimates: Record<string, { landed_cost: number; bnwt: number; premium: number; excellent: number; very_good: number; gp_pct: number }> = {};
  for (const r of body.rows ?? []) {
    const base = ctx.subCategories.find((s) => s.slug === r.slug);
    if (!base) continue;
    const weightKg = typeof r.weight_kg === "number" && r.weight_kg > 0 ? r.weight_kg : base.weightKg;
    const valueIndex = typeof r.value_index === "number" && r.value_index > 0 ? r.value_index : base.valueIndex;
    const profileCode = (["fast", "standard", "slow"].includes(String(r.profile_code)) ? r.profile_code : base.profileCode) as typeof base.profileCode;
    const est = computePrice({ weightKg, profileCode, valueIndex }, ctx.settings, ctx.refs);
    estimates[base.slug] = { landed_cost: Math.round(est.landedCost), bnwt: est.gradePrices.bnwt, premium: est.gradePrices.premium, excellent: est.gradePrices.excellent, very_good: est.gradePrices.very_good, gp_pct: est.gpPct };
  }
  return NextResponse.json({ estimates });
}

const MEASURE_TYPES = ["top", "bottom", "dress", "outer", "kids_top", "kids_bottom"];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A three-letter SKU code from the name, avoiding ones already in use. */
function suggestCode(name: string, used: Set<string>): string {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  const candidates = [
    words.map((w) => w[0]).join("").slice(0, 3),
    letters.slice(0, 3),
    (words[0] ?? "").slice(0, 2) + (words[1]?.[0] ?? ""),
  ].filter((c) => c.length === 3);
  for (const c of candidates) if (!used.has(c)) return c;
  for (const base of [letters.slice(0, 2), "XX"]) for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!used.has(base + ch)) return base + ch;
  return "ZZZ";
}

/**
 * PUT /api/admin/sub-categories { name, category_slug, weight_kg, profile_code, value_index, measure_type, code? }
 * Adds a sub-category. The code is suggested from the name unless given;
 * it must be three unique letters because every SKU embeds it.
 */
export async function PUT(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { name?: string; category_slug?: string; weight_kg?: number; profile_code?: string; value_index?: number; measure_type?: string; code?: string; market_ceiling?: number | null; market_price?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const { data: cat } = await gate.db.from("categories").select("slug").eq("slug", body.category_slug ?? "").maybeSingle();
  if (!cat) return NextResponse.json({ error: "Pick a category." }, { status: 400 });
  const err = check({ weight_kg: body.weight_kg, profile_code: body.profile_code, value_index: body.value_index, market_ceiling: body.market_ceiling ?? null, market_price: body.market_price ?? null });
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  if (!MEASURE_TYPES.includes(String(body.measure_type))) return NextResponse.json({ error: "Measurement type must be top, bottom, dress, outer, kids_top or kids_bottom." }, { status: 400 });

  const { data: existing } = await gate.db.from("sub_categories").select("code, slug");
  const usedCodes = new Set((existing ?? []).map((s) => s.code));
  const usedSlugs = new Set((existing ?? []).map((s) => s.slug));
  let code = body.code?.trim().toUpperCase();
  if (code) {
    if (!/^[A-Z]{3}$/.test(code)) return NextResponse.json({ error: "Code must be exactly three letters." }, { status: 400 });
    if (usedCodes.has(code)) return NextResponse.json({ error: `Code ${code} is already used — pick another.` }, { status: 409 });
  } else {
    code = suggestCode(name, usedCodes);
  }
  let slug = `${slugify(cat.slug).split("-").map((w) => w[0]).join("")}-${slugify(name)}`;
  for (let i = 2; usedSlugs.has(slug); i++) slug = `${slug}-${i}`;

  const row = { slug, code, category_slug: cat.slug, name, weight_kg: body.weight_kg, profile_code: body.profile_code, value_index: body.value_index, measure_type: body.measure_type, market_ceiling: body.market_ceiling ?? null, market_price: body.market_price ?? null, per_piece_share: 0, active: true };
  const { data, error } = await gate.db.from("sub_categories").insert(row).select("slug, code, name").single();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "23505" ? 409 : 500 });
  await audit(gate.db, gate.staff.id, "sub_categories", slug, null, row, "created");
  return NextResponse.json({ sub_category: data });
}

export async function PATCH(request: Request) {
  let body: { rows?: Record<string, unknown>[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) return NextResponse.json({ error: "rows is required." }, { status: 400 });

  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const supabase = gate.db;

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
