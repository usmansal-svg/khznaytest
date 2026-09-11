/**
 * QC as review. The reviewer picks a held garment (or scans one), sees
 * exactly what the tagger entered — condition, brand, garment type, size,
 * season, wearer, rare — and either approves it or corrects it. Corrections
 * are applied to the garment (repriced when the condition or type changes),
 * recorded against the tagger, and the hold is released.
 *
 * GET  /api/qc?mode=held                garments held for QC, oldest first
 * GET  /api/qc?mode=photo               30 random recent photographed garments not yet reviewed
 * GET  /api/qc?mode=lookup&sku=…        one garment
 * POST /api/qc { sku, method, note?, grade?, brand_text?, sub_category_slug?, size_label?, season?, wearer?, is_rare? }
 */

import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/staff";
import { GRADE_RANK, type GradeCode } from "@/lib/pricing/constants";
import { quote } from "@/lib/pricing/quote";
import { loadLot, loadPricingContext, resolveBrandDb } from "@/lib/pricing/repo";

export const instant = false;

const senior = (role: string) => ["qc_senior", "manager", "founder"].includes(role);
const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
const SELECT = "id, sku, brand_text, brand_tier, size_label, colour, season, wearer, is_rare, rare_reasons, rare_note, photos, weight_kg, lot_id, grade_code, adjust_pct, price, price_manual, standard_price, qc_hold, tagged_by, tagged_at, sub_category_slug, sub_categories(name, gender, categories(name)), staff:tagged_by(name)";
type Row = { id: number; sku: string; brand_text: string | null; brand_tier: string; size_label: string | null; colour: string | null; season: string | null; wearer: string | null; is_rare: boolean; photos: unknown; grade_code: string; price: number | null; price_manual: number | null; qc_hold: boolean; tagged_by: number | null; tagged_at: string; sub_category_slug: string; sub_categories: unknown; staff?: unknown };

function shape(r: Row) {
  const sc = one<{ name: string; gender: string; categories: unknown }>(r.sub_categories);
  const photos = (r.photos ?? []) as { url: string; kind: string }[];
  return {
    id: r.id, sku: r.sku, brand: r.brand_text ?? "", grade: r.grade_code, size_label: r.size_label ?? "", season: r.season ?? "", wearer: r.wearer ?? "", is_rare: r.is_rare,
    sub_category_slug: r.sub_category_slug, sub_category: sc?.name ?? "", category: one<{ name: string }>(sc?.categories)?.name ?? "", gender: sc?.gender ?? "",
    price: r.price_manual ?? r.price, photo: photos.find((p) => p.kind === "original")?.url ?? photos[0]?.url ?? null, tagged_at: r.tagged_at, tagger: one<{ name: string }>(r.staff)?.name ?? "", held: r.qc_hold,
  };
}

export async function GET(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  if (!senior(gate.staff.role)) return NextResponse.json({ error: "QC is for seniors and managers." }, { status: 403 });
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "held";
  const db = gate.db;

  if (mode === "lookup") {
    const sku = url.searchParams.get("sku")?.trim().toUpperCase();
    if (!sku) return NextResponse.json({ error: "sku is required." }, { status: 400 });
    const { data } = await db.from("items").select(SELECT).eq("sku", sku).maybeSingle();
    if (!data) return NextResponse.json({ error: `No item with SKU ${sku}.` }, { status: 404 });
    const { data: prior } = await db.from("qc_reviews").select("reviewed_at, outcome").eq("item_id", data.id).order("reviewed_at", { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json({ item: shape(data as unknown as Row), already_reviewed: prior ?? null });
  }
  if (mode === "held") {
    const { data } = await db.from("items").select(SELECT).eq("qc_hold", true).order("tagged_at", { ascending: true }).limit(200);
    return NextResponse.json({ items: ((data ?? []) as unknown as Row[]).map(shape) });
  }
  // photo mode: 30 random photographed garments from the last 7 days not yet reviewed
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: recent } = await db.from("items").select(SELECT).gte("tagged_at", since).neq("grade_code", "rejected").eq("qc_hold", false).order("tagged_at", { ascending: false }).limit(600);
  const { data: reviewed } = await db.from("qc_reviews").select("item_id").gte("reviewed_at", since);
  const done = new Set((reviewed ?? []).map((a) => a.item_id));
  const pool = ((recent ?? []) as unknown as Row[]).filter((r) => !done.has(r.id) && ((r.photos ?? []) as unknown[]).length > 0);
  const week = Math.floor(Date.now() / (7 * 86400_000));
  const seeded = pool.map((r) => ({ r, k: ((r.id * 2654435761 + week * 97) >>> 0) % 100000 })).sort((a, b) => a.k - b.k).slice(0, 30).map((x) => shape(x.r));
  return NextResponse.json({ items: seeded, pool: pool.length });
}

const FIELDS = ["grade", "brand_text", "sub_category_slug", "size_label", "season", "wearer", "is_rare"] as const;
const LABEL: Record<string, string> = { grade: "Condition", brand_text: "Brand", sub_category_slug: "Garment type", size_label: "Size", season: "Season", wearer: "Wearer", is_rare: "Rare find" };

export async function POST(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  if (!senior(gate.staff.role)) return NextResponse.json({ error: "QC is for seniors and managers." }, { status: 403 });
  let body: { sku?: string; method?: string; note?: string | null; grade?: string; brand_text?: string; sub_category_slug?: string; size_label?: string; season?: string; wearer?: string; is_rare?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const sku = (body.sku ?? "").trim().toUpperCase();
  if (!sku) return NextResponse.json({ error: "sku is required." }, { status: 400 });
  const db = gate.db;
  const { data: item } = await db.from("items").select(SELECT).eq("sku", sku).maybeSingle();
  if (!item) return NextResponse.json({ error: `No item with SKU ${sku}.` }, { status: 404 });
  if (item.tagged_by === gate.staff.id) return NextResponse.json({ error: "You tagged this one — someone else must review it." }, { status: 400 });

  // What changed, field by field.
  const corrections: { field: string; label: string; from: string | boolean | null; to: string | boolean | null }[] = [];
  const patch: Record<string, unknown> = {};
  const want = { grade: body.grade, brand_text: body.brand_text?.trim(), sub_category_slug: body.sub_category_slug, size_label: body.size_label?.trim(), season: body.season, wearer: body.wearer, is_rare: body.is_rare };
  const current: Record<string, string | boolean | null> = { grade: item.grade_code, brand_text: item.brand_text, sub_category_slug: item.sub_category_slug, size_label: item.size_label, season: item.season, wearer: item.wearer, is_rare: item.is_rare };
  for (const f of FIELDS) {
    const to = want[f];
    if (to === undefined) continue;
    const from = current[f];
    const same = f === "is_rare" ? Boolean(to) === Boolean(from) : String(to ?? "") === String(from ?? "");
    if (same) continue;
    corrections.push({ field: f, label: LABEL[f], from, to: to as string | boolean });
    patch[f === "grade" ? "grade_code" : f] = f === "is_rare" ? Boolean(to) : to || null;
  }

  const ctx = await loadPricingContext(db);
  const priceBefore = item.price_manual ?? item.price;
  let priceAfter: number | null = priceBefore;

  if (corrections.length) {
    // Brand corrections resolve to the listed brand (tier follows); condition or type changes reprice.
    if ("brand_text" in patch && patch.brand_text) {
      const b = await resolveBrandDb(db, String(patch.brand_text));
      patch.brand_text = b.name; patch.brand_id = b.id; patch.brand_tier = b.tier;
    }
    if ("grade_code" in patch && !ctx.refs.grades.some((g) => g.code === patch.grade_code)) return NextResponse.json({ error: "Unknown condition." }, { status: 400 });
    const slug = String(patch.sub_category_slug ?? item.sub_category_slug);
    const sub = ctx.subCategories.find((s) => s.slug === slug);
    if (!sub) return NextResponse.json({ error: "Unknown garment type." }, { status: 400 });
    if (("grade_code" in patch || "sub_category_slug" in patch || "brand_tier" in patch) && item.price_manual == null) {
      const lot = item.lot_id ? await loadLot(db, item.lot_id, ctx.settings) : null;
      const brand = "brand_tier" in patch ? { id: patch.brand_id as number | null, name: String(patch.brand_text), tier: patch.brand_tier as "regular", matched: true } : await resolveBrandDb(db, item.brand_text ?? "");
      const q = quote({ subCategory: sub, brand, grade: (patch.grade_code as GradeCode) ?? (item.grade_code as GradeCode), adjustment: "standard", adjustPct: 0, isRare: Boolean(patch.is_rare ?? item.is_rare), lot, weightKg: item.weight_kg }, ctx);
      if (q.price != null) { patch.price = q.price; patch.standard_price = q.standard_price; patch.landed_cost = q.landed_cost; priceAfter = q.price; }
    }
    const { error } = await db.from("items").update(patch).eq("id", item.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Keep the older grade_audits trail for the dashboard's accuracy figures.
    if ("grade_code" in patch) {
      await db.from("grade_audits").insert({ item_id: item.id, original_grade: item.grade_code, audit_grade: patch.grade_code, audited_by: gate.staff.id, note: body.note?.trim() || null, method: body.method === "photo" ? "photo" : "physical", price_delta: priceAfter != null && priceBefore != null ? priceAfter - priceBefore : null });
    }
  }

  const { error: revError } = await db.from("qc_reviews").insert({
    item_id: item.id, tagger_id: item.tagged_by, reviewed_by: gate.staff.id, method: body.method === "photo" ? "photo" : "physical",
    outcome: corrections.length ? "corrected" : "correct", corrections, price_before: priceBefore, price_after: priceAfter, note: body.note?.trim() || null,
  });
  if (revError) return NextResponse.json({ error: revError.message }, { status: 500 });
  if (item.qc_hold) await db.from("items").update({ qc_hold: false, qc_released_at: new Date().toISOString() }).eq("id", item.id);

  const gradeChange = corrections.find((c) => c.field === "grade");
  return NextResponse.json({
    ok: true, outcome: corrections.length ? "corrected" : "correct", corrections, price_before: priceBefore, price_after: priceAfter,
    reprint: corrections.some((c) => ["grade", "brand_text", "sub_category_slug", "size_label", "is_rare"].includes(c.field)) || priceAfter !== priceBefore,
    grade_direction: gradeChange ? (GRADE_RANK[gradeChange.to as GradeCode] > GRADE_RANK[gradeChange.from as GradeCode] ? "tagger_low" : "tagger_high") : null,
    released: Boolean(item.qc_hold),
  });
}
