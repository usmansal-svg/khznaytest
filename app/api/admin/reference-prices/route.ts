/**
 * GET    /api/admin/reference-prices        rows + the "needs a price" list by tagging frequency
 * POST   /api/admin/reference-prices        { brand_id|tier, sub_category_slug|category_slug, new_price_pkr, source?, confirmed?, note? }  upsert
 * DELETE /api/admin/reference-prices        { id }
 */

import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";

const TIERS = ["regular", "affordable_luxury", "ultra_luxury"];

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const db = gate.db;
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const [rowsRes, itemsRes] = await Promise.all([
    db.from("reference_prices").select("id, brand_id, tier, sub_category_slug, category_slug, new_price_pkr, source, confirmed, note, updated_at, brands(name), sub_categories(name, gender), categories(name, gender), staff:updated_by(name)").order("updated_at", { ascending: false }).limit(2000),
    db.from("items").select("brand_id, brand_text, brand_tier, sub_category_slug, sub_categories(name, gender, category_slug, categories(name))").gte("tagged_at", since).neq("grade_code", "rejected").not("brand_id", "is", null).limit(20000),
  ]);
  if (rowsRes.error) return NextResponse.json({ error: rowsRes.error.message }, { status: 500 });
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  const rows = (rowsRes.data ?? []).map((r) => ({
    id: r.id, brand_id: r.brand_id, brand: one<{ name: string }>(r.brands)?.name ?? null, tier: r.tier,
    sub_category_slug: r.sub_category_slug, sub_category: one<{ name: string; gender: string }>(r.sub_categories)?.name ?? null,
    category_slug: r.category_slug, category: one<{ name: string; gender: string }>(r.categories)?.name ?? null,
    gender: one<{ gender: string }>(r.sub_categories)?.gender ?? one<{ gender: string }>(r.categories)?.gender ?? null,
    new_price_pkr: r.new_price_pkr, source: r.source, confirmed: r.confirmed, note: r.note, updated_at: r.updated_at, by: one<{ name: string }>(r.staff)?.name ?? null,
  }));
  const have = new Set(rows.filter((r) => r.brand_id != null && r.sub_category_slug).map((r) => `${r.brand_id}|${r.sub_category_slug}`));
  const counts = new Map<string, { brand_id: number; brand: string; sub_category_slug: string; sub_category: string; category: string; gender: string; n: number }>();
  for (const i of itemsRes.data ?? []) {
    if (!i.brand_id || !i.sub_category_slug) continue;
    const k = `${i.brand_id}|${i.sub_category_slug}`;
    if (have.has(k)) continue;
    const sc = one<{ name: string; gender: string; category_slug: string; categories: unknown }>(i.sub_categories);
    const e = counts.get(k) ?? { brand_id: i.brand_id, brand: i.brand_text ?? "", sub_category_slug: i.sub_category_slug, sub_category: sc?.name ?? "", category: one<{ name: string }>(sc?.categories)?.name ?? "", gender: sc?.gender ?? "", n: 0 };
    e.n += 1;
    counts.set(k, e);
  }
  return NextResponse.json({ rows, needs: [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 40) });
}

export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { brand_id?: number | null; tier?: string | null; sub_category_slug?: string | null; category_slug?: string | null; new_price_pkr?: number; source?: string; confirmed?: boolean; note?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const hasBrand = body.brand_id != null, hasTier = Boolean(body.tier);
  if (hasBrand === hasTier) return NextResponse.json({ error: "Give a brand or a tier, not both." }, { status: 400 });
  if (hasTier && !TIERS.includes(String(body.tier))) return NextResponse.json({ error: "Bad tier." }, { status: 400 });
  const hasSub = Boolean(body.sub_category_slug), hasCat = Boolean(body.category_slug);
  if (hasSub === hasCat) return NextResponse.json({ error: "Give a sub-category or a category, not both." }, { status: 400 });
  if (!(Number.isInteger(body.new_price_pkr) && body.new_price_pkr! > 0)) return NextResponse.json({ error: "New price must be a whole rupee amount above 0." }, { status: 400 });
  const source = ["founder", "research", "formula"].includes(String(body.source)) ? body.source : "founder";

  const db = gate.db;
  let q = db.from("reference_prices").select("id, new_price_pkr, source, confirmed");
  q = hasBrand ? q.eq("brand_id", body.brand_id!) : q.eq("tier", body.tier!);
  q = hasSub ? q.eq("sub_category_slug", body.sub_category_slug!) : q.eq("category_slug", body.category_slug!);
  const { data: existing } = await q.maybeSingle();
  const row = { brand_id: hasBrand ? body.brand_id : null, tier: hasTier ? body.tier : null, sub_category_slug: hasSub ? body.sub_category_slug : null, category_slug: hasCat ? body.category_slug : null, new_price_pkr: body.new_price_pkr, source, confirmed: body.confirmed ?? source === "founder", note: body.note?.trim() || null, updated_by: gate.staff.id, updated_at: new Date().toISOString() };
  const res = existing ? await db.from("reference_prices").update(row).eq("id", existing.id).select("id").single() : await db.from("reference_prices").insert(row).select("id").single();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  await audit(db, gate.staff.id, "reference_prices", String(res.data.id), existing ?? null, row);
  return NextResponse.json({ id: res.data.id });
}

export async function DELETE(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const { data: before } = await gate.db.from("reference_prices").select("*").eq("id", body.id).maybeSingle();
  const { error } = await gate.db.from("reference_prices").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(gate.db, gate.staff.id, "reference_prices", String(body.id), before, null, "deleted");
  return NextResponse.json({ ok: true });
}
