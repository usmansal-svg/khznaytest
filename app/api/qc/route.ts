/**
 * GET  /api/qc?mode=held               garments held for QC at the warehouse (blind)
 * GET  /api/qc?mode=photo              30 random recent photos not yet audited (blind)
 * GET  /api/qc?mode=lookup&sku=…       one garment for a scanned tag (blind)
 * POST /api/qc { sku, grade, method?, note? }   record the regrade; releases a hold
 *
 * Blind: responses never include the tagger's grade. The comparison is
 * made server-side when the audit is saved, and the price difference is
 * stored so drift can be read in rupees.
 */

import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/staff";
import { computePrice } from "@/lib/pricing/engine";
import { loadLot, loadPricingContext } from "@/lib/pricing/repo";
import type { GradeCode } from "@/lib/pricing/constants";

const GRADES: GradeCode[] = ["bnwt", "premium", "excellent", "very_good", "rejected"];
const RANK: Record<string, number> = { rejected: 0, very_good: 1, excellent: 2, premium: 3, bnwt: 4 };

type Row = { id: number; sku: string; brand_text: string | null; brand_tier: string; size_label: string | null; colour: string | null; photos: unknown; weight_kg: number | null; lot_id: number | null; grade_code: string; adjust_pct: number | null; price: number | null; qc_hold: boolean; tagged_by: number | null; tagged_at: string; sub_categories: unknown; staff?: unknown };
const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
function blind(r: Row) {
  const sc = one<{ name: string; gender: string; categories: unknown }>(r.sub_categories);
  const photos = (r.photos as { url: string; kind: string }[] | null) ?? [];
  return { id: r.id, sku: r.sku, brand: r.brand_text ?? "Unbranded", size_label: r.size_label, colour: r.colour, sub_category: sc?.name ?? "", category: one<{ name: string }>(sc?.categories)?.name ?? "", gender: sc?.gender ?? "", photo: photos.find((p) => p.kind === "original")?.url ?? photos[0]?.url ?? null, tagged_at: r.tagged_at, tagger: one<{ name: string }>(r.staff)?.name ?? "", held: r.qc_hold };
}

function senior(role: string) {
  return ["qc_senior", "manager", "founder"].includes(role);
}

export async function GET(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  if (!senior(gate.staff.role)) return NextResponse.json({ error: "QC is for seniors and managers." }, { status: 403 });
  const db = gate.db;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "held";

  if (mode === "lookup") {
    const sku = (url.searchParams.get("sku") ?? "").trim().toUpperCase();
    const { data } = await db.from("items").select("id, sku, brand_text, brand_tier, size_label, colour, photos, weight_kg, lot_id, grade_code, adjust_pct, price, qc_hold, tagged_by, tagged_at, sub_categories(name, gender, categories(name)), staff:tagged_by(name)").eq("sku", sku).maybeSingle();
    if (!data) return NextResponse.json({ error: `No item with SKU ${sku}.` }, { status: 404 });
    const { data: prior } = await db.from("grade_audits").select("audited_at").eq("item_id", data.id).order("audited_at", { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json({ item: blind(data as unknown as Row), already_audited: prior?.audited_at ?? null });
  }

  if (mode === "held") {
    const { data } = await db.from("items").select("id, sku, brand_text, brand_tier, size_label, colour, photos, weight_kg, lot_id, grade_code, adjust_pct, price, qc_hold, tagged_by, tagged_at, sub_categories(name, gender, categories(name)), staff:tagged_by(name)").eq("qc_hold", true).order("tagged_at", { ascending: true }).limit(200);
    return NextResponse.json({ items: ((data ?? []) as unknown as Row[]).map(blind) });
  }

  // photo mode: 30 random sellable garments from the last 7 days with a photo, not yet audited
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: recent } = await db.from("items").select("id, sku, brand_text, brand_tier, size_label, colour, photos, weight_kg, lot_id, grade_code, adjust_pct, price, qc_hold, tagged_by, tagged_at, sub_categories(name, gender, categories(name)), staff:tagged_by(name)").gte("tagged_at", since).neq("grade_code", "rejected").eq("qc_hold", false).order("tagged_at", { ascending: false }).limit(600);
  const { data: audited } = await db.from("grade_audits").select("item_id").gte("audited_at", since);
  const auditedSet = new Set((audited ?? []).map((a) => a.item_id));
  const pool = ((recent ?? []) as unknown as Row[]).filter((r) => !auditedSet.has(r.id) && ((r.photos as unknown[] | null)?.length ?? 0) > 0);
  const week = Math.floor(Date.now() / (7 * 86400_000));
  const seeded = pool.map((r) => ({ r, k: ((r.id * 2654435761 + week * 97) >>> 0) % 100000 })).sort((a, b) => a.k - b.k).slice(0, 30).map((x) => blind(x.r));
  return NextResponse.json({ items: seeded, pool: pool.length });
}

export async function POST(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  if (!senior(gate.staff.role)) return NextResponse.json({ error: "QC is for seniors and managers." }, { status: 403 });
  let body: { sku?: string; grade?: string; method?: string; note?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const sku = (body.sku ?? "").trim().toUpperCase();
  const grade = body.grade as GradeCode;
  if (!sku || !GRADES.includes(grade)) return NextResponse.json({ error: "sku and a grade are required." }, { status: 400 });
  const method = body.method === "photo" ? "photo" : "physical";

  const db = gate.db;
  const { data: item } = await db.from("items").select("id, sku, brand_tier, weight_kg, lot_id, grade_code, adjust_pct, price, qc_hold, tagged_by, sub_categories(name)").eq("sku", sku).maybeSingle();
  if (!item) return NextResponse.json({ error: `No item with SKU ${sku}.` }, { status: 404 });
  if (item.tagged_by === gate.staff.id) return NextResponse.json({ error: "You tagged this one — someone else must audit it." }, { status: 400 });

  // What it would have been priced at under the audit grade — same lot, weight and adjustment.
  let priceDelta: number | null = null;
  const ctx = await loadPricingContext(db);
  const sc = ctx.subCategories.find((s) => s.name === one<{ name: string }>(item.sub_categories)?.name);
  const lot = item.lot_id ? await loadLot(db, item.lot_id, ctx.settings) : null;
  if (sc && lot?.effectiveRate != null && item.price != null) {
    const r = computePrice({ weightKg: Number(item.weight_kg ?? 0), basis: lot.basis, effectiveRate: lot.effectiveRate, imported: lot.imported, profileCode: sc.profileCode, valueIndex: sc.valueIndex, gradeCode: grade, tier: item.brand_tier as "regular", adjustPct: item.adjust_pct ?? 0 }, ctx.settings, ctx.refs);
    priceDelta = r.price - Number(item.price);
  }

  const { error } = await db.from("grade_audits").insert({ item_id: item.id, original_grade: item.grade_code, audit_grade: grade, audited_by: gate.staff.id, note: body.note?.trim() || null, method, price_delta: priceDelta });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (item.qc_hold) await db.from("items").update({ qc_hold: false, qc_released_at: new Date().toISOString() }).eq("id", item.id);

  const direction = RANK[grade] === RANK[item.grade_code] ? "agree" : RANK[grade] > RANK[item.grade_code] ? "tagger_low" : "tagger_high";
  return NextResponse.json({ ok: true, original_grade: item.grade_code, audit_grade: grade, direction, price_delta: priceDelta, released: Boolean(item.qc_hold) });
}
