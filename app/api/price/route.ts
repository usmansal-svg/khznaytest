/**
 * POST /api/price — compute a price without saving it.
 *
 * This is the single source of pricing truth (section 13). The tagging form
 * must never compute a price client-side: if it does, the browser and the
 * server will disagree the first time settings change.
 *
 * Settings, grades, profiles and sub-categories come from the database, so
 * whatever the pricing sidebar last saved is what prices here. The logic
 * itself lives in lib/pricing/quote.ts so it can be tested without a request.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { type Adjustment, type GradeCode } from "@/lib/pricing/constants";
import { ADJUSTMENTS, GRADE_CODES, quote } from "@/lib/pricing/quote";
import { loadPricingContext, resolveBrandDb } from "@/lib/pricing/repo";

type Body = {
  sub_category_id?: string;
  grade?: string;
  brand_text?: string;
  brand_id?: string;
  adjustment?: string;
  is_rare?: boolean;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const grade = (body.grade ?? "premium") as GradeCode;
  if (!GRADE_CODES.includes(grade)) return NextResponse.json({ error: `Unknown grade: ${body.grade}` }, { status: 400 });
  const adjustment = (body.adjustment ?? "standard") as Adjustment;
  if (!ADJUSTMENTS.includes(adjustment)) return NextResponse.json({ error: `Unknown adjustment: ${body.adjustment}` }, { status: 400 });

  const supabase = await createClient();
  const [ctx, brand] = await Promise.all([loadPricingContext(supabase), resolveBrandDb(supabase, body.brand_text ?? body.brand_id)]);

  const subCategory = ctx.subCategories.find((s) => s.slug === body.sub_category_id);
  if (!subCategory) {
    return NextResponse.json({ error: `Unknown sub_category_id: ${body.sub_category_id ?? "(missing)"}` }, { status: 400 });
  }

  return NextResponse.json(quote({ subCategory, brand, grade, adjustment, isRare: Boolean(body.is_rare) }, ctx));
}
