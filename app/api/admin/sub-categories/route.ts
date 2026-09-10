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
const EDITABLE = ["category_slug", "gender", "name", "weight_kg", "profile_code", "value_index", "market_ceiling", "market_price", "per_piece_cost", "per_piece_share", "planning_rate_usd_per_kg", "standard_cost_pkr", "active"] as const;
const GENDERS = ["men", "women", "teenage", "kid", "toddler", "infant"];

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sub_categories")
    .select("slug, code, category_slug, gender, name, weight_kg, profile_code, value_index, measure_type, market_ceiling, market_price, per_piece_cost, per_piece_share, planning_rate_usd_per_kg, standard_cost_pkr, active, categories(name, sort_order)")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const genderOrder = ["men", "women", "teenage", "kid", "toddler", "infant"];
  // Planning estimate, the way the Excel sheet does it: default weight at the
  // planning rate, imported. Real garments price from their lot and scale.
  const ctx = await loadPricingContext(supabase);
  const rows = (data ?? [])
    .map((r) => {
      const cat = (Array.isArray(r.categories) ? r.categories[0] : r.categories) as { name: string; sort_order: number } | null;
      return {
        ...r,
        category: cat?.name ?? "",
        category_order: cat?.sort_order ?? 0,
        categories: undefined,
        ...estimates({ weight_kg: Number(r.weight_kg), profile_code: r.profile_code, value_index: Number(r.value_index), planning_rate_usd_per_kg: r.planning_rate_usd_per_kg == null ? null : Number(r.planning_rate_usd_per_kg), per_piece_cost: r.per_piece_cost == null ? null : Number(r.per_piece_cost), standard_cost_pkr: r.standard_cost_pkr == null ? null : Number(r.standard_cost_pkr), market_price: r.market_price == null ? null : Number(r.market_price) }, ctx),
      };
    })
    .sort((a, b) => genderOrder.indexOf(a.gender) - genderOrder.indexOf(b.gender) || a.category_order - b.category_order || a.name.localeCompare(b.name));
  return NextResponse.json({ rows, basis: { planning_rate: ctx.settings.blendedRate, fx: ctx.settings.fx, target_gp: ctx.settings.targetGP } });
}

type EstimateInput = { weight_kg: number; profile_code: string; value_index: number; planning_rate_usd_per_kg: number | null; per_piece_cost: number | null; standard_cost_pkr: number | null; market_price: number | null };
type Estimate = { landed_cost: number; loaded_cost: number; bnwt: number; premium: number; excellent: number; very_good: number; gp_pct: number; effective_gp_pct: number };

/**
 * Planning estimates for both buying bases. Per kg uses the sub-category's
 * own rate, else the settings planning rate; per piece uses its piece
 * price and is null until one is set. Imported (duty + tax credit), like
 * the Excel sheet.
 */
/** From the purchase cost per piece: landed (constants applied), then the shelf prices; a market price sets Premium. */
function estimates(r: EstimateInput, ctx: Awaited<ReturnType<typeof loadPricingContext>>): { estimate: Estimate | null } {
  if (!r.standard_cost_pkr) return { estimate: null };
  const e = computePrice({ weightKg: 0, basis: "pc", effectiveRate: r.standard_cost_pkr, imported: true, profileCode: r.profile_code as "fast", valueIndex: r.value_index, premiumOverride: r.market_price }, ctx.settings, ctx.refs);
  return { estimate: { landed_cost: Math.round(e.landedCost), loaded_cost: Math.round(e.loadedCost), effective_gp_pct: e.effectiveGpPct, bnwt: e.gradePrices.bnwt, premium: e.gradePrices.premium, excellent: e.gradePrices.excellent, very_good: e.gradePrices.very_good, gp_pct: e.gpPct } };
}

/**
 * POST /api/admin/sub-categories?preview=1 { rows: [{ slug, weight_kg?, profile_code?, value_index? }] }
 * Live estimates for draft edits — nothing is saved. Same engine, same
 * settings, so what the screen shows while typing is what Save will give.
 */
export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { rows?: { slug?: string; profile_code?: string; value_index?: number; standard_cost_pkr?: number | null; market_price?: number | null }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const ctx = await loadPricingContext(gate.db);
  const { data: current } = await gate.db.from("sub_categories").select("slug, weight_kg, profile_code, value_index, planning_rate_usd_per_kg, per_piece_cost, standard_cost_pkr, market_price").in("slug", (body.rows ?? []).map((r) => r.slug ?? ""));
  const out: Record<string, ReturnType<typeof estimates>> = {};
  for (const r of body.rows ?? []) {
    const base = (current ?? []).find((s) => s.slug === r.slug);
    if (!base) continue;
    const num = (v: unknown, fallback: number) => (typeof v === "number" && v > 0 ? v : fallback);
    const opt = (v: unknown, fallback: number | null) => (v === null ? null : typeof v === "number" && v > 0 ? v : fallback);
    out[base.slug] = estimates({
      weight_kg: Number(base.weight_kg),
      profile_code: ["fast", "standard", "slow"].includes(String(r.profile_code)) ? String(r.profile_code) : base.profile_code,
      value_index: num(r.value_index, Number(base.value_index)),
      planning_rate_usd_per_kg: base.planning_rate_usd_per_kg == null ? null : Number(base.planning_rate_usd_per_kg),
      per_piece_cost: base.per_piece_cost == null ? null : Number(base.per_piece_cost),
      standard_cost_pkr: opt(r.standard_cost_pkr, base.standard_cost_pkr == null ? null : Number(base.standard_cost_pkr)),
      market_price: opt(r.market_price, base.market_price == null ? null : Number(base.market_price)),
    }, ctx);
  }
  return NextResponse.json({ estimates: out });
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
  let body: { name?: string; category_slug?: string; weight_kg?: number; standard_cost_pkr?: number; profile_code?: string; value_index?: number; measure_type?: string; code?: string; market_ceiling?: number | null; market_price?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const { data: catRow } = await gate.db.from("categories").select("slug, gender").eq("slug", body.category_slug ?? "").not("gender", "is", null).maybeSingle();
  if (!catRow) return NextResponse.json({ error: "Pick a category." }, { status: 400 });
  const cat = { slug: catRow.slug };
  const gender = catRow.gender as string;
  if (!(typeof body.standard_cost_pkr === "number" && body.standard_cost_pkr > 0)) return NextResponse.json({ error: "Standard cost per garment (Rs) is required." }, { status: 400 });
  const err = check({ weight_kg: body.weight_kg ?? 0.3, profile_code: body.profile_code, value_index: body.value_index, market_ceiling: body.market_ceiling ?? null, market_price: body.market_price ?? null });
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
  let slug = `${gender}-${slugify(name)}`;
  for (let i = 2; usedSlugs.has(slug); i++) slug = `${slug}-${i}`;

  const row = { slug, code, category_slug: cat.slug, gender, name, weight_kg: body.weight_kg ?? 0.3, standard_cost_pkr: body.standard_cost_pkr, profile_code: body.profile_code, value_index: body.value_index, measure_type: body.measure_type, market_ceiling: body.market_ceiling ?? null, market_price: body.market_price ?? null, per_piece_share: 0, active: true };
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
      .select("category_slug, gender, name, weight_kg, profile_code, value_index, market_ceiling, market_price, per_piece_cost, per_piece_share, planning_rate_usd_per_kg, standard_cost_pkr, active")
      .eq("slug", slug)
      .maybeSingle();
    if (!before) {
      results.push({ slug, ok: false, error: "Unknown sub-category." });
      continue;
    }
    if (typeof patch.category_slug === "string") {
      const { data: c } = await supabase.from("categories").select("gender").eq("slug", patch.category_slug).not("gender", "is", null).maybeSingle();
      if (!c) { results.push({ slug, ok: false, error: "Unknown category." }); continue; }
      patch.gender = c.gender;
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
  if ("gender" in p && !GENDERS.includes(String(p.gender))) return "gender must be men, women, teenage, kid, toddler or infant.";
  if ("name" in p && !String(p.name ?? "").trim()) return "name cannot be empty.";
  for (const k of ["market_ceiling", "market_price", "per_piece_cost", "planning_rate_usd_per_kg", "standard_cost_pkr"] as const) {
    if (k in p && p[k] !== null && !(typeof p[k] === "number" && (p[k] as number) >= 0)) return `${k} must be a non-negative number or empty.`;
  }
  if ("per_piece_share" in p && !(typeof p.per_piece_share === "number" && p.per_piece_share >= 0 && p.per_piece_share <= 1)) return "per_piece_share must be between 0 and 1.";
  if ("active" in p && typeof p.active !== "boolean") return "active must be true or false.";
  return null;
}
