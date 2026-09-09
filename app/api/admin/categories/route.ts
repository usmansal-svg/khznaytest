/**
 * GET   /api/admin/categories            — active categories with their gender
 * POST  /api/admin/categories            — { gender, name }
 * PATCH /api/admin/categories            — { slug, name?, active?, gender? }
 */

import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";

const GENDERS = ["men", "women", "teenage", "kid", "toddler", "infant"];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const { data, error } = await gate.db.from("categories").select("slug, name, sort_order, gender, active").not("gender", "is", null).order("gender").order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { gender?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Category name is required." }, { status: 400 });
  if (!GENDERS.includes(String(body.gender))) return NextResponse.json({ error: "Pick a gender." }, { status: 400 });
  const slug = `${body.gender}-${slugify(name)}`;
  if (slug === `${body.gender}-`) return NextResponse.json({ error: "Category name needs some letters." }, { status: 400 });

  const { data: last } = await gate.db.from("categories").select("sort_order").eq("gender", body.gender).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await gate.db
    .from("categories")
    .insert({ slug, name, gender: body.gender, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("slug, name, sort_order, gender, active")
    .single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? `${name} already exists under that gender.` : error.message }, { status: error.code === "23505" ? 409 : 500 });
  await audit(gate.db, gate.staff.id, "categories", slug, null, data, "created");
  return NextResponse.json({ category: data });
}

export async function PATCH(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { slug?: string; name?: string; active?: boolean; gender?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body.slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) { if (!body.name.trim()) return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 }); patch.name = body.name.trim(); }
  if (body.active !== undefined) patch.active = body.active;
  if (body.gender !== undefined) { if (!GENDERS.includes(body.gender)) return NextResponse.json({ error: "Bad gender." }, { status: 400 }); patch.gender = body.gender; }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const { data: before } = await gate.db.from("categories").select("name, gender, active").eq("slug", body.slug).maybeSingle();
  const { data, error } = await gate.db.from("categories").update(patch).eq("slug", body.slug).select("slug, name, sort_order, gender, active").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // A category's gender moves its sub-categories with it.
  if (patch.gender) await gate.db.from("sub_categories").update({ gender: patch.gender }).eq("category_slug", body.slug);
  await audit(gate.db, gate.staff.id, "categories", body.slug, before, { ...before, ...patch });
  return NextResponse.json({ category: data });
}
