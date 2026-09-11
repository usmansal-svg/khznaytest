/**
 * GET /api/reference — everything the tag form needs to render, in one call:
 * categories, active sub-categories, outlets, open lots with their effective
 * rates, grades (Rejected included), the signed-in tagger, and this month's
 * colour tag.
 */

import { NextResponse } from "next/server";

import { currentStaff, dbFor } from "@/lib/auth/staff";
import { colourForMonth } from "@/lib/pricing/engine";
import { loadOpenLots, loadPricingContext } from "@/lib/pricing/repo";
import { ASKS_SLEEVE, MEASUREMENT_FIELDS } from "@/lib/pricing/sub-categories";
import { GENDERS, GENDER_LABELS } from "@/lib/pricing/sku";

/** Fallback quick-pick list until enough garments are tagged to rank brands by frequency. */
const COMMON_BRANDS = ["Nike", "Adidas", "Under Armour", "Calvin Klein", "Zara", "H&M", "Puma", "Tommy Hilfiger", "Levi's", "Ralph Lauren", "Gap", "Old Navy", "Uniqlo", "Hollister", "American Eagle", "Abercrombie & Fitch", "Primark", "Next", "Marks & Spencer", "George"];

export async function GET() {
  const me = await currentStaff();
  const supabase = await dbFor(me);
  const ctx = await loadPricingContext(supabase);
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const [categoriesRes, outletsRes, lots, recentRes, quickRes, byCatRes] = await Promise.all([
    supabase.from("categories").select("slug, name, sort_order, gender").not("gender", "is", null).eq("active", true).order("sort_order"),
    supabase.from("outlets").select("id, name, is_online").eq("active", true).order("id"),
    loadOpenLots(supabase, ctx.settings),
    supabase.from("items").select("brand_text").gte("tagged_at", since).not("brand_text", "is", null).limit(5000),
    supabase.from("brands").select("name, logo_url").eq("active", true).not("quick_pick_order", "is", null).order("quick_pick_order").limit(20),
    supabase.from("brand_quick_picks").select("category_name, position, brands(name, logo_url, active)").order("position"),
  ]);

  // Quick-pick brands: chosen by hand on the Brands page (Usman's call —
  // once the list is long, automatic ranking is not what he wants). Until
  // any are chosen, fall back to the most tagged in the last 90 days topped
  // up from the brands that come through every bale.
  const chosen = (quickRes.data ?? []).map((b) => b.name);
  const logos = new Map((quickRes.data ?? []).map((b) => [b.name, b.logo_url ?? null]));
  const counts = new Map<string, number>();
  for (const r of recentRes.data ?? []) { const b = (r.brand_text ?? "").trim(); if (b) counts.set(b, (counts.get(b) ?? 0) + 1); }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([b]) => b);
  const topBrands: string[] = [];
  for (const b of chosen.length ? chosen : [...ranked, ...COMMON_BRANDS]) { if (topBrands.length >= 20) break; if (!topBrands.some((t) => t.toLowerCase() === b.toLowerCase())) topBrands.push(b); }

  let tagger: { name: string; role: string; outlet_id: number | null; today: number; target: number } | null = null;
  if (me) {
    // "Today" in Pakistan time.
    const nowPk = new Date(Date.now() + 5 * 3600_000);
    const startIso = new Date(Date.UTC(nowPk.getUTCFullYear(), nowPk.getUTCMonth(), nowPk.getUTCDate()) - 5 * 3600_000).toISOString();
    const [{ count }, { data: row }] = await Promise.all([
      supabase.from("items").select("id", { count: "exact", head: true }).eq("tagged_by", me.id).gte("tagged_at", startIso),
      supabase.from("staff").select("daily_target").eq("id", me.id).maybeSingle(),
    ]);
    tagger = { name: me.name, role: me.role, outlet_id: me.outlet_id, today: count ?? 0, target: row?.daily_target ?? ctx.settings.defaultDailyTarget };
  }

  // A failed lookup must not masquerade as an empty list: say so, visibly.
  const warnings = [ctx.warning];
  if (categoriesRes.error) warnings.push(`Categories could not be loaded (${categoriesRes.error.message}); reload the page.`);
  if (outletsRes.error) warnings.push(`Outlets could not be loaded (${outletsRes.error.message}); reload the page.`);

  return NextResponse.json({
    genders: GENDERS.map((g) => ({ code: g, name: GENDER_LABELS[g] })),
    top_brands: topBrands.map((name) => ({ name, logo_url: logos.get(name) ?? null })),
    // Per-category quick picks, keyed by category name; the form uses the
    // list for the selected category and falls back to top_brands.
    brand_picks_by_category: (() => {
      const out: Record<string, { name: string; logo_url: string | null }[]> = {};
      for (const p of byCatRes.data ?? []) {
        const b = (Array.isArray(p.brands) ? p.brands[0] : p.brands) as { name: string; logo_url: string | null; active: boolean } | null;
        if (!b || !b.active) continue;
        (out[p.category_name] ??= []).push({ name: b.name, logo_url: b.logo_url ?? null });
      }
      return out;
    })(),
    categories: categoriesRes.data ?? [],
    sub_categories: ctx.subCategories
      .filter((s) => s.active)
      .map((s) => ({
        slug: s.slug,
        code: s.code,
        category_slug: s.categorySlug,
        gender: s.gender,
        name: s.name,
        measure_type: s.measureType,
        season: s.season,
        measure_fields: MEASUREMENT_FIELDS[s.measureType],
        asks_sleeve: ASKS_SLEEVE.has(s.measureType),
        weight_kg: s.weightKg,
        profile_code: s.profileCode,
        value_index: s.valueIndex,
      })),
    outlets: outletsRes.data ?? [],
    lots: lots.map((l) => ({ id: l.id, code: l.code, supplier: l.supplier, basis: l.basis, rate: l.rate, effective_rate: l.effectiveRate, yield: l.yield, status: l.status })),
    grades: ctx.refs.grades.map((g) => ({ code: g.code, name: g.name })),
    tagger,
    colour_tag: colourForMonth(new Date()),
    settings_version: ctx.settingsVersion,
    outlet_min_grade: ctx.settings.outletMinGrade,
    pricing_source: ctx.source,
    ...(warnings.some(Boolean) ? { warning: warnings.filter(Boolean).join(" ") } : {}),
  });
}
