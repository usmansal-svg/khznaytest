/**
 * GET /api/photos/queue — online garments waiting for their pictures, oldest
 * first, plus the ones shot today. The photography station works from this
 * list: scan a tag, take the pictures on the garment page, next.
 */

import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/staff";

export const instant = false;

type Row = { sku: string; brand_text: string | null; size_label: string | null; grade_code: string; tagged_at: string; photos: unknown[] | null; online_status: string | null; sub_categories: { name: string } | { name: string }[] | null };

export async function GET() {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  const { data, error } = await gate.db
    .from("items")
    .select("sku, brand_text, size_label, grade_code, tagged_at, photos, online_status, sub_categories(name)")
    .eq("channel", "online")
    .in("status", ["tagged", "on_floor"])
    .order("tagged_at", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as Row[];
  const shape = (r: Row) => ({
    sku: r.sku, brand: r.brand_text, size: r.size_label, grade: r.grade_code, tagged_at: r.tagged_at, online_status: r.online_status,
    sub_category: (Array.isArray(r.sub_categories) ? r.sub_categories[0] : r.sub_categories)?.name ?? "",
    photos: r.photos?.length ?? 0,
  });
  const waiting = rows.filter((r) => !(r.photos?.length)).map(shape);
  const done = rows.filter((r) => (r.photos?.length ?? 0) > 0).map(shape).slice(-50).reverse();
  return NextResponse.json({ waiting, done, total_online: rows.length });
}
