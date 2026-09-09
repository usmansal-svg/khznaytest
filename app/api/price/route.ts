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
import { type Adjustment, type GradeCode } from "@/lib/pricing/constants";
import { ADJUSTMENTS, GRADE_CODES, quote } from "@/lib/pricing/quote";
import { loadLot, loadPricingContext, resolveBrandDb } from "@/lib/pricing/repo";

type Body = {
  sub_category_id?: string;
  grade?: string;
  brand_text?: string;
  adjustment?: string;
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
  if (body.weight_kg != null && !(typeof body.weight_kg === "number" && body.weight_kg > 0 && body.weight_kg < 50)) {
    return NextResponse.json({ error: "weight_kg must be a positive number of kilograms." }, { status: 400 });
  }

  const supabase = await dbFor(await currentStaff());
  const ctx = await loadPricingContext(supabase);
  const [brand, lot] = await Promise.all([
    resolveBrandDb(supabase, body.brand_text),
    body.lot_id != null ? loadLot(supabase, Number(body.lot_id), ctx.settings) : Promise.resolve(null),
  ]);
  if (body.lot_id != null && !lot) return NextResponse.json({ error: `Unknown lot: ${body.lot_id}` }, { status: 400 });

  const subCategory = ctx.subCategories.find((s) => s.slug === body.sub_category_id);
  if (!subCategory) return NextResponse.json({ error: `Unknown sub_category_id: ${body.sub_category_id ?? "(missing)"}` }, { status: 400 });

  return NextResponse.json(quote({ subCategory, brand, grade, adjustment, isRare: Boolean(body.is_rare), lot, weightKg: body.weight_kg ?? null }, ctx));
}
