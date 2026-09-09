/**
 * GET   /api/admin/profiles
 * PATCH /api/admin/profiles { rows: [{ code, pulled_share, vol_full, vol_md1, vol_md2, vol_md3 }] }
 *
 * The sell-rate profiles — the largest remaining source of error in the
 * model. Volumes must sum to 1; the multiple is recomputed from them, never
 * stored. Managers and the founder only; every save is audited.
 */

import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";
import { profileMultiple } from "@/lib/pricing/engine";
import { loadPricingContext } from "@/lib/pricing/repo";
import type { ProfileCode } from "@/lib/pricing/constants";

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const ctx = await loadPricingContext(gate.db);
  return NextResponse.json({
    profiles: ctx.refs.profiles.map((p) => ({ ...p, multiple: Math.round(profileMultiple(p.code, ctx.settings, ctx.refs) * 1e6) / 1e6 })),
  });
}

type Row = { code?: string; pulled_share?: number; vol_full?: number; vol_md1?: number; vol_md2?: number; vol_md3?: number };

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

  for (const r of body.rows) {
    const nums = [r.pulled_share, r.vol_full, r.vol_md1, r.vol_md2, r.vol_md3];
    if (!["fast", "standard", "slow"].includes(String(r.code))) return NextResponse.json({ error: `Unknown profile ${r.code}.` }, { status: 400 });
    if (nums.some((n) => typeof n !== "number" || n < 0 || n > 1)) return NextResponse.json({ error: `${r.code}: every share must be between 0 and 1.` }, { status: 400 });
    const sum = r.vol_full! + r.vol_md1! + r.vol_md2! + r.vol_md3!;
    if (Math.abs(sum - 1) > 0.0005) return NextResponse.json({ error: `${r.code}: full + 25% + 50% + 75% must add up to 100% (now ${(sum * 100).toFixed(1)}%).` }, { status: 400 });
  }

  const before = await loadPricingContext(gate.db);
  for (const r of body.rows) {
    const { error } = await gate.db.from("profiles").update({ pulled_share: r.pulled_share, vol_full: r.vol_full, vol_promo: 0, vol_md1: r.vol_md1, vol_md2: r.vol_md2, vol_md3: r.vol_md3 }).eq("code", r.code);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await audit(gate.db, gate.staff.id, "profiles", r.code!, before.refs.profiles.find((p) => p.code === r.code) ?? null, r);
  }
  const after = await loadPricingContext(gate.db);
  return NextResponse.json({
    profiles: after.refs.profiles.map((p) => ({ ...p, multiple: Math.round(profileMultiple(p.code as ProfileCode, after.settings, after.refs) * 1e6) / 1e6 })),
  });
}
