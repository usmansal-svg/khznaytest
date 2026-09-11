/**
 * GET  /api/admin/brands            — full list
 * POST /api/admin/brands            — { brands: [{ name, tier, active? }] } upsert by name
 * POST /api/admin/brands?csv=1      — { csv } lines of "Brand,Tier[,...]" (Khazanay_brand_tiers.csv)
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { audit, requireManager } from "@/lib/admin/auth";

const TIERS = ["regular", "affordable_luxury", "ultra_luxury"] as const;
type Tier = (typeof TIERS)[number];

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("brands").select("id, name, tier, active, source, added_at, quick_pick_order, logo_url, staff:added_by(name)").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name: string } | null | undefined;
  return NextResponse.json({ brands: (data ?? []).map((b) => ({ id: b.id, name: b.name, tier: b.tier, active: b.active, source: b.source, added_at: b.added_at, quick_pick_order: b.quick_pick_order ?? null, logo_url: b.logo_url ?? null, added_by: one(b.staff)?.name ?? null })) });
}

/**
 * PATCH /api/admin/brands { quick_pick: ["Nike", "Adidas", …] } — the quick-pick
 * buttons on the tag form, in order. Everything not listed is cleared.
 */
export async function PATCH(request: Request) {
  let body: { quick_pick?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const names = [...new Set((body.quick_pick ?? []).map((n) => String(n).trim()).filter(Boolean))].slice(0, 20);
  const db = gate.db;
  const { data: before } = await db.from("brands").select("name, quick_pick_order").not("quick_pick_order", "is", null).order("quick_pick_order");
  const { error: clearError } = await db.from("brands").update({ quick_pick_order: null }).not("quick_pick_order", "is", null);
  if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 });
  for (let i = 0; i < names.length; i++) {
    const { error } = await db.from("brands").update({ quick_pick_order: i + 1 }).eq("name", names[i]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await audit(db, gate.staff.id, "brands", "quick-pick", (before ?? []).map((b) => b.name), names, "Quick-pick brands on the tag form");
  return NextResponse.json({ quick_pick: names });
}

export async function POST(request: Request) {
  let body: { brands?: { name?: string; tier?: string; active?: boolean }[]; csv?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const supabase = gate.db;

  const isCsv = new URL(request.url).searchParams.get("csv") === "1";
  const incoming = isCsv ? parseCsv(body.csv ?? "") : (body.brands ?? []).map((b) => ({ name: b.name ?? "", tier: b.tier ?? "", active: b.active ?? true }));

  const clean: { name: string; tier: Tier; active: boolean; source: string }[] = [];
  const rejected: string[] = [];
  for (const b of incoming) {
    const name = b.name.trim();
    const tier = normaliseTier(b.tier);
    if (!name || !tier) {
      rejected.push(`${b.name || "(blank)"} / ${b.tier || "(no tier)"}`);
      continue;
    }
    clean.push({ name, tier, active: b.active ?? true, source: "admin" });
  }
  if (!clean.length) return NextResponse.json({ error: "No valid brands.", rejected }, { status: 400 });

  const { data: before } = await supabase.from("brands").select("name, tier, active").in("name", clean.map((c) => c.name));
  const { error } = await supabase.from("brands").upsert(clean, { onConflict: "name" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(supabase, gate.staff.id, "brands", isCsv ? "csv-import" : "upsert", before ?? [], clean, `${clean.length} brands`);
  return NextResponse.json({ upserted: clean.length, rejected });
}

/** Accepts "Brand,Tier,..." with a header row; tier text is matched loosely. */
function parseCsv(csv: string) {
  return csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l, i) => !(i === 0 && /^brand\s*,/i.test(l)))
    .map((l) => {
      const cells = l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return { name: cells[0] ?? "", tier: cells[1] ?? "", active: true };
    });
}

function normaliseTier(t: string | undefined): Tier | null {
  const s = (t ?? "").toLowerCase().replace(/[\s_-]+/g, "_");
  if (TIERS.includes(s as Tier)) return s as Tier;
  if (/^regular/.test(s) || /high_street/.test(s)) return "regular";
  if (/affordable/.test(s)) return "affordable_luxury";
  if (/ultra/.test(s)) return "ultra_luxury";
  return null;
}
