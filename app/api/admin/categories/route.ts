/**
 * GET  /api/admin/categories
 * POST /api/admin/categories { name, planning_rate_usd_per_kg? }
 */

import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const { data, error } = await gate.db.from("categories").select("slug, name, sort_order, planning_rate_usd_per_kg").order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { name?: string; planning_rate_usd_per_kg?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Category name is required." }, { status: 400 });
  const slug = slugify(name);
  if (!slug) return NextResponse.json({ error: "Category name needs some letters." }, { status: 400 });
  const rate = body.planning_rate_usd_per_kg;
  if (rate != null && !(typeof rate === "number" && rate > 0)) return NextResponse.json({ error: "Planning rate must be above 0." }, { status: 400 });

  const { data: last } = await gate.db.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await gate.db
    .from("categories")
    .insert({ slug, name, sort_order: (last?.sort_order ?? 0) + 1, planning_rate_usd_per_kg: rate ?? null })
    .select("slug, name, sort_order, planning_rate_usd_per_kg")
    .single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? `A category called ${name} already exists.` : error.message }, { status: error.code === "23505" ? 409 : 500 });
  await audit(gate.db, gate.staff.id, "categories", slug, null, data, "created");
  return NextResponse.json({ category: data });
}
