/**
 * The catalogue as a tree — gender → category → sub-category — with the
 * Shopify tag each node produces. Managers grow and prune it here; the
 * numbers behind each sub-category (cost, weight, profile) stay on
 * Pricing → Categories.
 *
 * GET  /api/admin/catalogue
 * POST /api/admin/catalogue
 *   { action: "add_category", gender, name }
 *   { action: "add_sub", category_slug, name }          numbers copied from a sibling in the same category
 *   { action: "rename", kind: "category"|"sub", slug, name }
 *   { action: "set_tag", kind, slug, tag }               hand-set Shopify tag; blank = automatic
 *   { action: "toggle", kind, slug, active }
 *   { action: "delete", kind, slug }                     a sub-category with garments is hidden instead of deleted; a category must be empty
 */

import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";
import { menuTags } from "@/lib/shopify/tags";

export const instant = false;

const GENDERS = ["men", "women", "teenage", "kid", "toddler", "infant"] as const;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

export async function GET() {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const db = gate.db;
  const [{ data: cats, error }, { data: subs }, { data: items }] = await Promise.all([
    db.from("categories").select("slug, name, gender, sort_order, active, shopify_tag").not("gender", "is", null).order("gender").order("sort_order"),
    db.from("sub_categories").select("slug, code, category_slug, gender, name, active, standard_cost_pkr, shopify_tag").order("name"),
    db.from("items").select("sub_category_slug").limit(200000),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const used = new Map<string, number>();
  for (const i of items ?? []) used.set(i.sub_category_slug, (used.get(i.sub_category_slug) ?? 0) + 1);
  const tree = GENDERS.map((gender) => ({
    gender,
    categories: (cats ?? []).filter((c) => c.gender === gender).map((c) => {
      const children = (subs ?? []).filter((s) => s.category_slug === c.slug).map((s) => { const t = menuTags(gender, c.name, s.name, { category: c.shopify_tag, sub: s.shopify_tag }); return { slug: s.slug, code: s.code, name: s.name, active: s.active, cost: s.standard_cost_pkr, items: used.get(s.slug) ?? 0, tag: t.sub, auto_tag: t.auto.sub, custom: Boolean(s.shopify_tag) }; });
      const t = menuTags(gender, c.name, null, { category: c.shopify_tag });
      return { slug: c.slug, name: c.name, active: c.active, tag: t.category, auto_tag: t.auto.category, custom: Boolean(c.shopify_tag), subs: children, items: children.reduce((n, s) => n + s.items, 0) };
    }),
  }));
  return NextResponse.json({ tree });
}

type Body = { action?: string; gender?: string; name?: string; category_slug?: string; kind?: "category" | "sub"; slug?: string; active?: boolean; tag?: string | null };

export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: Body;
  try { body = await request.json(); } catch { return bad("Body must be JSON."); }
  const db = gate.db;
  const me = gate.staff.id;
  const name = body.name?.trim() ?? "";

  if (body.action === "add_category") {
    if (!(GENDERS as readonly string[]).includes(String(body.gender))) return bad("Pick a gender.");
    if (name.length < 2) return bad("Give the category a name.");
    const slug = `${body.gender}-${slugify(name)}`;
    const { data: last } = await db.from("categories").select("sort_order").eq("gender", body.gender).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { error } = await db.from("categories").insert({ slug, name, gender: body.gender, sort_order: (last?.sort_order ?? 0) + 1, active: true });
    if (error) return bad(error.code === "23505" ? `A category called ${name} already exists for that gender.` : error.message);
    await audit(db, me, "categories", slug, null, { name, gender: body.gender }, "created from the catalogue tree");
    return NextResponse.json({ ok: true, slug });
  }

  if (body.action === "add_sub") {
    if (name.length < 2) return bad("Give the sub-category a name.");
    const { data: cat } = await db.from("categories").select("slug, name, gender").eq("slug", body.category_slug ?? "").not("gender", "is", null).maybeSingle();
    if (!cat) return bad("Pick a category.");
    const gender = cat.gender as string;
    // Numbers come from a sibling in the same category, else from the gender's most common values.
    const { data: siblings } = await db.from("sub_categories").select("weight_kg, profile_code, value_index, measure_type, standard_cost_pkr, season, code, slug").eq("category_slug", cat.slug).order("standard_cost_pkr", { ascending: false, nullsFirst: false });
    const { data: all } = await db.from("sub_categories").select("code, slug, standard_cost_pkr, measure_type").eq("gender", gender);
    const { data: every } = await db.from("sub_categories").select("code, slug");
    const model = siblings?.[0] ?? null;
    const costs = (all ?? []).map((s) => Number(s.standard_cost_pkr)).filter((n) => n > 0).sort((a, b) => a - b);
    const median = costs.length ? costs[Math.floor(costs.length / 2)] : 500;
    const kids = !["men", "women"].includes(gender);
    const guessMeasure = /dress|skirt|jumpsuit|romper/i.test(cat.name + " " + name) ? "dress" : /jacket|coat|blazer|outer|gilet|parka/i.test(cat.name + " " + name) ? "outer" : /pant|trouser|jean|short|bottom|legging|skort|joggers/i.test(cat.name + " " + name) ? (kids ? "kids_bottom" : "bottom") : kids ? "kids_top" : "top";
    const usedCodes = new Set((every ?? []).map((s) => s.code));
    const usedSlugs = new Set((every ?? []).map((s) => s.slug));
    const words = name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
    const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
    let code = [words.map((w) => w[0]).join("").slice(0, 3), letters.slice(0, 3), (words[0] ?? "").slice(0, 2) + (words[1]?.[0] ?? "")].filter((c) => c.length === 3).find((c) => !usedCodes.has(c));
    if (!code) { for (let i = 0; i < 26 * 26 && !code; i++) { const c = letters.slice(0, 1).padEnd(1, "X") + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)); if (!usedCodes.has(c)) code = c; } }
    let slug = `${gender}-${slugify(name)}`;
    for (let i = 2; usedSlugs.has(slug); i++) slug = `${gender}-${slugify(name)}-${i}`;
    const row = {
      slug, code, category_slug: cat.slug, gender, name, active: true, per_piece_share: 0,
      weight_kg: model ? Number(model.weight_kg) : 0.3, profile_code: model?.profile_code ?? "standard", value_index: model ? Number(model.value_index) : 1,
      measure_type: model?.measure_type ?? guessMeasure, season: model?.season ?? "all", standard_cost_pkr: model?.standard_cost_pkr != null ? Number(model.standard_cost_pkr) : median,
    };
    const { error } = await db.from("sub_categories").insert(row);
    if (error) return bad(error.message);
    await audit(db, me, "sub_categories", slug, null, row, model ? `created from the catalogue tree; numbers copied from ${model.slug}` : "created from the catalogue tree; numbers are the gender's typical values");
    return NextResponse.json({ ok: true, slug, code, copied_from: model?.slug ?? null, cost: row.standard_cost_pkr });
  }

  const table = body.kind === "category" ? "categories" : body.kind === "sub" ? "sub_categories" : null;
  if (!table || !body.slug) return bad("kind and slug are required.");

  if (body.action === "rename") {
    if (name.length < 2) return bad("Give it a name.");
    const { data: before } = await db.from(table).select("name").eq("slug", body.slug).maybeSingle();
    if (!before) return bad("No such row.");
    const { error } = await db.from(table).update({ name }).eq("slug", body.slug);
    if (error) return bad(error.message);
    await audit(db, me, table, body.slug, before, { name }, "renamed from the catalogue tree");
    return NextResponse.json({ ok: true });
  }

  if (body.action === "set_tag") {
    const tag = (body.tag ?? "").trim().replace(/\s+/g, " ").slice(0, 255) || null;
    const { data: before } = await db.from(table).select("shopify_tag").eq("slug", body.slug).maybeSingle();
    if (!before) return bad("No such row.");
    const { error } = await db.from(table).update({ shopify_tag: tag }).eq("slug", body.slug);
    if (error) return bad(error.message);
    await audit(db, me, table, body.slug, before, { shopify_tag: tag }, tag ? "Shopify tag set by hand" : "Shopify tag back to automatic");
    return NextResponse.json({ ok: true, tag });
  }

  if (body.action === "toggle") {
    const { data: before } = await db.from(table).select("active").eq("slug", body.slug).maybeSingle();
    if (!before) return bad("No such row.");
    const { error } = await db.from(table).update({ active: Boolean(body.active) }).eq("slug", body.slug);
    if (error) return bad(error.message);
    if (table === "categories") await db.from("sub_categories").update({ active: Boolean(body.active) }).eq("category_slug", body.slug);
    await audit(db, me, table, body.slug, before, { active: Boolean(body.active) }, body.active ? "switched on" : "switched off");
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    if (table === "categories") {
      const { count } = await db.from("sub_categories").select("slug", { count: "exact", head: true }).eq("category_slug", body.slug);
      if (count) return bad(`This category still has ${count} sub-categor${count === 1 ? "y" : "ies"}. Delete or move those first, or switch the category off.`);
    } else {
      const { count } = await db.from("items").select("id", { count: "exact", head: true }).eq("sub_category_slug", body.slug);
      if (count) {
        // Garments point at it, so the row must stay: hide it instead. The
        // garments keep their name; it can be restored with Show hidden.
        const { data: before } = await db.from(table).select("name, active").eq("slug", body.slug).maybeSingle();
        await db.from(table).update({ active: false }).eq("slug", body.slug);
        await audit(db, me, table, body.slug, before, { active: false }, `hidden instead of deleted: ${count} garments tagged under it`);
        return NextResponse.json({ ok: true, hidden: true, count });
      }
    }
    const { data: before } = await db.from(table).select("*").eq("slug", body.slug).maybeSingle();
    if (!before) return bad("No such row.");
    const { error } = await db.from(table).delete().eq("slug", body.slug);
    if (error) return bad(error.message);
    await audit(db, me, table, body.slug, before, null, "deleted from the catalogue tree");
    return NextResponse.json({ ok: true });
  }

  return bad("Unknown action.");
}
