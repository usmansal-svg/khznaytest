/**
 * GET /api/photos/queue — online garments waiting for their pictures, oldest
 * first, plus the ones shot today. The photography station works from this
 * list: scan a tag, take the pictures on the garment page, next.
 */

import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/staff";

export const instant = false;

type Row = { sku: string; brand_text: string | null; size_label: string | null; grade_code: string; tagged_at: string; photos: { kind?: string }[] | null; online_status: string | null; photographed_at: string | null; sub_categories: { name: string } | { name: string }[] | null; photographer: { name: string } | { name: string }[] | null };

export async function GET() {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  // Today (Pakistan time): garments this person photographed, against their target.
  const nowPk = new Date(Date.now() + 5 * 3600_000);
  const startIso = new Date(Date.UTC(nowPk.getUTCFullYear(), nowPk.getUTCMonth(), nowPk.getUTCDate()) - 5 * 3600_000).toISOString();
  const [{ count: today }, { data: me }, { data: settingsRow }] = await Promise.all([
    gate.db.from("items").select("id", { count: "exact", head: true }).eq("photographed_by", gate.staff.id).gte("photographed_at", startIso),
    gate.db.from("staff").select("daily_target").eq("id", gate.staff.id).maybeSingle(),
    gate.db.from("settings").select("default_daily_target").order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const target = me?.daily_target ?? Number(settingsRow?.default_daily_target ?? 60);
  const { data, error } = await gate.db
    .from("items")
    .select("sku, brand_text, size_label, grade_code, tagged_at, photos, online_status, photographed_at, sub_categories(name), photographer:photographed_by(name)")
    .eq("channel", "online")
    .in("status", ["tagged", "on_floor"])
    .order("tagged_at", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as Row[];
  // Who took the pictures is for supervisors and above; a photographer sees only their own name.
  const seesNames = ["qc_senior", "manager", "founder"].includes(gate.staff.role);
  const shape = (r: Row) => {
    const originals = (r.photos ?? []).filter((p) => p.kind !== "cutout").length;
    const cutouts = (r.photos ?? []).filter((p) => p.kind === "cutout").length;
    const who = (Array.isArray(r.photographer) ? r.photographer[0] : r.photographer)?.name ?? null;
    return {
      sku: r.sku, brand: r.brand_text, size: r.size_label, grade: r.grade_code, tagged_at: r.tagged_at, online_status: r.online_status,
      sub_category: (Array.isArray(r.sub_categories) ? r.sub_categories[0] : r.sub_categories)?.name ?? "",
      photos: originals, cutouts, photographed_at: r.photographed_at,
      photographer: seesNames || who === gate.staff.name ? who : null,
    };
  };
  const waiting = rows.filter((r) => !(r.photos?.length)).map(shape);
  const done = rows.filter((r) => (r.photos?.length ?? 0) > 0).map(shape).reverse();
  return NextResponse.json({ waiting, done, total_online: rows.length, sees_names: seesNames, me: { name: gate.staff.name, role: gate.staff.role, today: today ?? 0, target, pct: target ? Math.round(((today ?? 0) / target) * 100) : 0 } });
}
