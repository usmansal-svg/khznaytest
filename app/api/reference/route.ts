/**
 * GET /api/reference — everything the tag form needs to render, in one call:
 * categories, active sub-categories, outlets, recent lots, grades, the
 * signed-in tagger, and this month's colour tag.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { colourForMonth } from "@/lib/pricing/engine";
import { loadPricingContext } from "@/lib/pricing/repo";
import { MEASUREMENT_FIELDS } from "@/lib/pricing/sub-categories";

export async function GET() {
  const supabase = await createClient();
  const [ctx, categoriesRes, outletsRes, lotsRes, authRes] = await Promise.all([
    loadPricingContext(supabase),
    supabase.from("categories").select("slug, name, sort_order").order("sort_order"),
    supabase.from("outlets").select("id, name, is_online").eq("active", true).order("id"),
    supabase.from("lots").select("code, supplier").order("created_at", { ascending: false }).limit(50),
    supabase.auth.getUser(),
  ]);

  let tagger: { name: string; role: string } | null = null;
  if (authRes.data.user) {
    const { data } = await supabase.rpc("ensure_staff");
    if (data) tagger = { name: (data as { name: string }).name, role: (data as { role: string }).role };
  }

  return NextResponse.json({
    categories: categoriesRes.data ?? [],
    sub_categories: ctx.subCategories
      .filter((s) => s.active)
      .map((s) => ({
        slug: s.slug,
        code: s.code,
        category_slug: s.categorySlug,
        name: s.name,
        measure_type: s.measureType,
        measure_fields: MEASUREMENT_FIELDS[s.measureType],
        weight_kg: s.weightKg,
        profile_code: s.profileCode,
        value_index: s.valueIndex,
      })),
    outlets: outletsRes.data ?? [],
    lots: lotsRes.data ?? [],
    grades: ctx.refs.grades.map((g) => ({ code: g.code, name: g.name })),
    tagger,
    colour_tag: colourForMonth(new Date()),
    settings_version: ctx.settingsVersion,
    pricing_source: ctx.source,
    ...(ctx.warning ? { warning: ctx.warning } : {}),
  });
}
