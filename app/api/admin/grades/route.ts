/**
 * GET   /api/admin/grades
 * PATCH /api/admin/grades { rows: [{ code, multiplier, share_of_intake }] }
 *
 * Grade multipliers and the assumed intake mix. Premium stays 1.00 — every
 * other grade derives from it. Shares of the five grades must sum to 1.
 */

import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";
import { loadPricingContext } from "@/lib/pricing/repo";

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const ctx = await loadPricingContext(gate.db);
  return NextResponse.json({ grades: ctx.refs.grades });
}

type Row = { code?: string; multiplier?: number; share_of_intake?: number };

export async function PATCH(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { rows?: Row[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || !body.rows.length) return NextResponse.json({ error: "rows is required." }, { status: 400 });

  const before = await loadPricingContext(gate.db);
  const merged = before.refs.grades.map((g) => {
    const r = body.rows!.find((x) => x.code === g.code);
    return r ? { ...g, multiplier: r.multiplier ?? g.multiplier, shareOfIntake: r.share_of_intake ?? g.shareOfIntake } : g;
  });
  for (const g of merged) {
    if (!(g.multiplier >= 0 && g.multiplier <= 5)) return NextResponse.json({ error: `${g.name}: multiplier must be between 0 and 5.` }, { status: 400 });
    if (!(g.shareOfIntake >= 0 && g.shareOfIntake <= 1)) return NextResponse.json({ error: `${g.name}: share must be between 0 and 1.` }, { status: 400 });
  }
  if (merged.find((g) => g.code === "premium")?.multiplier !== 1) return NextResponse.json({ error: "Premium must stay at 1.00 — every other grade is relative to it." }, { status: 400 });
  if (merged.find((g) => g.code === "rejected")?.multiplier !== 0) return NextResponse.json({ error: "Rejected must stay at 0." }, { status: 400 });
  const sum = merged.reduce((s, g) => s + g.shareOfIntake, 0);
  if (Math.abs(sum - 1) > 0.0005) return NextResponse.json({ error: `Intake shares must add up to 100% (now ${(sum * 100).toFixed(1)}%).` }, { status: 400 });

  for (const g of merged) {
    const { error } = await gate.db.from("grades").update({ multiplier: g.multiplier, share_of_intake: g.shareOfIntake }).eq("code", g.code);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Keep the rejected share in settings in step with the grade table.
  const rejected = merged.find((g) => g.code === "rejected")?.shareOfIntake;
  if (rejected != null && Math.abs(rejected - before.settings.rejectedShare) > 1e-9) {
    const version = before.settingsVersion + 1;
    const { settingsToRow } = await import("@/lib/pricing/repo");
    await gate.db.from("settings").insert({ version, ...settingsToRow({ ...before.settings, rejectedShare: rejected }), note: "Rejected share changed with the grade mix", changed_by: gate.staff.id });
  }
  await audit(gate.db, gate.staff.id, "grades", "all", before.refs.grades, merged);
  const after = await loadPricingContext(gate.db);
  return NextResponse.json({ grades: after.refs.grades });
}
