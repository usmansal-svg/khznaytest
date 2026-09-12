/**
 * POST /api/price — compute a price without saving it.
 *
 * The single source of pricing truth. The tagging form never computes a
 * price client-side. With `lot_id` and `weight_kg` the cost is the
 * garment's own weight at the lot's effective rate (or the lot's per-piece
 * rate); without a lot it is a planning quote and says so.
 */

import { NextResponse } from "next/server";

import { currentStaff, dbFor } from "@/lib/auth/staff";
import { MANAGER_ROLES } from "@/lib/auth/session";
import { type Adjustment, type GradeCode } from "@/lib/pricing/constants";
import { ADJUSTMENTS, GRADE_CODES, quote } from "@/lib/pricing/quote";
import { loadLot, loadPricingContext, resolveBrandDb } from "@/lib/pricing/repo";

type Body = {
  sub_category_id?: string;
  grade?: string;
  brand_text?: string;
  adjustment?: string;
  adjust_pct?: number;
  is_rare?: boolean;
  lot_id?: number | null;
  weight_kg?: number | null;
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
  const adjustPct = body.adjust_pct == null ? undefined : Number(body.adjust_pct);
  if (adjustPct != null && !(Number.isInteger(adjustPct) && adjustPct % 5 === 0 && adjustPct >= -50 && adjustPct <= 100)) {
    return NextResponse.json({ error: "adjust_pct must be a multiple of 5 between -50 and 100." }, { status: 400 });
  }
  if (body.weight_kg != null && !(typeof body.weight_kg === "number" && body.weight_kg > 0 && body.weight_kg < 50)) {
    return NextResponse.json({ error: "weight_kg must be a positive number of kilograms." }, { status: 400 });
  }

  const me = await currentStaff();
  const supabase = await dbFor(me);
  const ctx = await loadPricingContext(supabase);
  const [brand, lot] = await Promise.all([
    resolveBrandDb(supabase, body.brand_text),
    Promise.resolve(null),
  ]);

  const subCategory = ctx.subCategories.find((s) => s.slug === body.sub_category_id);
  if (!subCategory) return NextResponse.json({ error: `Unknown sub_category_id: ${body.sub_category_id ?? "(missing)"}` }, { status: 400 });

  const q = quote({ subCategory, brand, grade, adjustment, adjustPct, isRare: Boolean(body.is_rare), lot, weightKg: body.weight_kg ?? null }, ctx);
  // Taggers see the shelf price and the grade prices only. Cost, margin,
  // expected revenue, the multiple and the markdown ladder are management.
  if (!me || !MANAGER_ROLES.has(me.role)) {
    const { landed_cost: _c, gp_pct: _g, expected_revenue: _e, multiple: _m, markdowns: _l, ...visible } = q; // eslint-disable-line @typescript-eslint/no-unused-vars
    return NextResponse.json({ ...visible, landed_cost: null, gp_pct: null, expected_revenue: null, multiple: null, markdowns: [], restricted: true });
  }
  return NextResponse.json(q);
}
