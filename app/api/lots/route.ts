/**
 * GET /api/lots — the lots the commercial software has recorded, read-only:
 * number, description, quantity expected, status, and how many garments
 * have been tagged from each here. No financial columns (see archive/lots).
 */
import { NextResponse } from "next/server";

import { currentStaff, dbFor } from "@/lib/auth/staff";

export const instant = false;

export async function GET() {
  const supabase = await dbFor(await currentStaff());
  const [lotsRes, itemsRes] = await Promise.all([
    supabase.from("lots").select("id, code, description, pieces, status, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("items").select("lot_id, grade_code").not("lot_id", "is", null).limit(200000),
  ]);
  if (lotsRes.error) return NextResponse.json({ error: lotsRes.error.message }, { status: 500 });
  const tagged = new Map<number, { n: number; rejects: number }>();
  for (const i of itemsRes.data ?? []) { const e = tagged.get(i.lot_id) ?? { n: 0, rejects: 0 }; e.n++; if (i.grade_code === "rejected") e.rejects++; tagged.set(i.lot_id, e); }
  return NextResponse.json({
    lots: (lotsRes.data ?? []).map((l) => {
      const t = tagged.get(l.id) ?? { n: 0, rejects: 0 };
      return { id: l.id, code: l.code, description: l.description, pieces: l.pieces, status: l.status, created_at: l.created_at, tagged: t.n, rejects: t.rejects, pct_done: l.pieces ? Math.min(1, t.n / l.pieces) : null };
    }),
  });
}
