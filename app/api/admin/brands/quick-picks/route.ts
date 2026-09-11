/**
 * GET   /api/admin/brands/quick-picks — { lists: { [category_name]: string[] }, categories: string[] }
 * PATCH /api/admin/brands/quick-picks { category_name, quick_pick: string[] }
 *
 * Quick-pick brand buttons per category on the tag form, keyed by category
 * name so one list serves every gender's category of that name. The general
 * list lives on brands.quick_pick_order (PATCH /api/admin/brands).
 */

import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";

export const instant = false;

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const [{ data: picks, error }, { data: cats }] = await Promise.all([
    gate.db.from("brand_quick_picks").select("category_name, position, brands(name)").order("position"),
    gate.db.from("categories").select("name, sort_order").not("gender", "is", null).eq("active", true).order("sort_order"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lists: Record<string, string[]> = {};
  for (const p of picks ?? []) {
    const b = (Array.isArray(p.brands) ? p.brands[0] : p.brands) as { name: string } | null;
    if (!b) continue;
    (lists[p.category_name] ??= []).push(b.name);
  }
  return NextResponse.json({ lists, categories: [...new Set((cats ?? []).map((c) => c.name))] });
}

export async function PATCH(request: Request) {
  let body: { category_name?: string; quick_pick?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const category = String(body.category_name ?? "").trim();
  if (!category) return NextResponse.json({ error: "category_name is required." }, { status: 400 });
  const names = [...new Set((body.quick_pick ?? []).map((n) => String(n).trim()).filter(Boolean))].slice(0, 20);
  const db = gate.db;
  const { data: brands } = await db.from("brands").select("id, name").in("name", names);
  const idOf = new Map((brands ?? []).map((b) => [b.name, b.id]));
  const missing = names.filter((n) => !idOf.has(n));
  if (missing.length) return NextResponse.json({ error: `Not on the brand list: ${missing.join(", ")}. Add them under Brands first.` }, { status: 400 });

  const { data: before } = await db.from("brand_quick_picks").select("position, brands(name)").eq("category_name", category).order("position");
  const { error: delError } = await db.from("brand_quick_picks").delete().eq("category_name", category);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
  if (names.length) {
    const { error } = await db.from("brand_quick_picks").insert(names.map((n, i) => ({ category_name: category, brand_id: idOf.get(n)!, position: i + 1 })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const beforeNames = (before ?? []).map((p) => ((Array.isArray(p.brands) ? p.brands[0] : p.brands) as { name: string } | null)?.name).filter(Boolean);
  await audit(db, gate.staff.id, "brand_quick_picks", category, beforeNames, names, `Quick-pick brands for ${category}`);
  return NextResponse.json({ category_name: category, quick_pick: names });
}
