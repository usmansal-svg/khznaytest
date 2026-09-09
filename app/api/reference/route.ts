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

export async function GET() {
  const me = await currentStaff();
  const supabase = await dbFor(me);
  const ctx = await loadPricingContext(supabase);
  const [categoriesRes, outletsRes, lots] = await Promise.all([
    supabase.from("categories").select("slug, name, sort_order, planning_rate_usd_per_kg").order("sort_order"),
    supabase.from("outlets").select("id, name, is_online").eq("active", true).order("id"),
    loadOpenLots(supabase, ctx.settings),
  ]);

  const tagger = me ? { name: me.name, role: me.role, outlet_id: me.outlet_id } : null;

  // A failed lookup must not masquerade as an empty list: say so, visibly.
  const warnings = [ctx.warning];
  if (categoriesRes.error) warnings.push(`Categories could not be loaded (${categoriesRes.error.message}); reload the page.`);
  if (outletsRes.error) warnings.push(`Outlets could not be loaded (${outletsRes.error.message}); reload the page.`);

  return NextResponse.json({
    genders: GENDERS.map((g) => ({ code: g, name: GENDER_LABELS[g] })),
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
    pricing_source: ctx.source,
    ...(warnings.some(Boolean) ? { warning: warnings.filter(Boolean).join(" ") } : {}),
  });
}
