/** Women's catalogue tidy-up agreed 13 Sep 2026: merges, moves, renames, new categories, menu order. Nothing tagged yet, so merged names are deleted. */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const G = "women";
const log = (...a) => console.log(...a);
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let { data: cats } = await db.from("categories").select("slug, name, sort_order, active").eq("gender", G);
let { data: subs } = await db.from("sub_categories").select("slug, name, category_slug, code, active, standard_cost_pkr, weight_kg, profile_code, value_index, measure_type, season, heavy_cost_pkr").eq("gender", G);
const cat = (name) => cats.find((c) => c.name.toLowerCase() === name.toLowerCase());
const sub = (catName, name) => subs.find((s) => s.category_slug === cat(catName)?.slug && s.name.toLowerCase() === name.toLowerCase());
async function used(slug) { const { count } = await db.from("items").select("id", { count: "exact", head: true }).eq("sub_category_slug", slug); return count ?? 0; }
async function del(catName, name) { const s = sub(catName, name); if (!s) return log(`  (no ${catName} › ${name})`); if (await used(s.slug)) return log(`  KEPT ${name}: garments use it`); await db.from("sub_categories").delete().eq("slug", s.slug); subs = subs.filter((x) => x.slug !== s.slug); log(`  deleted ${catName} › ${name}`); }
async function rename(catName, from, to) { const s = sub(catName, from); if (!s) return log(`  (no ${catName} › ${from})`); await db.from("sub_categories").update({ name: to }).eq("slug", s.slug); s.name = to; log(`  renamed ${from} → ${to}`); }
async function move(fromCat, name, toCat) { const s = sub(fromCat, name); const t = cat(toCat); if (!s || !t) return log(`  (cannot move ${name})`); await db.from("sub_categories").update({ category_slug: t.slug }).eq("slug", s.slug); s.category_slug = t.slug; log(`  moved ${name}: ${fromCat} → ${toCat}`); }
async function addCat(name) { if (cat(name)) return cat(name); const row = { slug: `${G}-${slugify(name)}`, name, gender: G, sort_order: 99, active: true }; await db.from("categories").insert(row); cats.push(row); log(`  new category ${name}`); return row; }
async function addSub(catName, name, model, measure) { const c = cat(catName); if (sub(catName, name)) return; const codes = new Set((await db.from("sub_categories").select("code")).data.map((x) => x.code)); const L = name.toUpperCase().replace(/[^A-Z]/g, ""); let code = [L.slice(0, 3), L[0] + L.slice(-2)].find((x) => x.length === 3 && !codes.has(x)); for (let i = 0; !code; i++) { const x = L[0] + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)); if (!codes.has(x)) code = x; } const m = model ?? subs[0]; const row = { slug: `${G}-${slugify(name)}`, code, category_slug: c.slug, gender: G, name, active: true, per_piece_share: 0, weight_kg: Number(m.weight_kg), profile_code: m.profile_code, value_index: Number(m.value_index), measure_type: measure ?? m.measure_type, season: "all", standard_cost_pkr: Number(m.standard_cost_pkr ?? 500) }; const { error } = await db.from("sub_categories").insert(row); if (error) return log("  ERR", name, error.message); subs.push(row); log(`  new ${catName} › ${name} (cost ${row.standard_cost_pkr} from ${m.name})`); }
async function mergeCat(fromName, toName) { const f = cat(fromName), t = cat(toName); if (!f || !t) return; await db.from("sub_categories").update({ category_slug: t.slug }).eq("category_slug", f.slug); subs.forEach((s) => { if (s.category_slug === f.slug) s.category_slug = t.slug; }); await db.from("categories").delete().eq("slug", f.slug); cats = cats.filter((c) => c.slug !== f.slug); log(`  merged category ${fromName} → ${toName}`); }

log("Tops & Blouses");
await del("Tops & Blouses", "Casual top"); await del("Tops & Blouses", "Formal top"); await del("Tops & Blouses", "Peplum top"); await del("Tops & Blouses", "Camisole");
await rename("Tops & Blouses", "Casual tank top", "Tank top & camisole"); await rename("Tops & Blouses", "Summer knit", "Knit top");
await move("Dresses & Jumpsuits", "Bodysuit", "Tops & Blouses");
log("Dresses"); await del("Dresses & Jumpsuits", "Playsuit / romper");
log("Pants"); await del("Pants & Trousers", "Palazzo"); await del("Pants & Trousers", "Culottes"); await rename("Pants & Trousers", "Legging", "Leggings");
log("Knitwear & outerwear"); await del("Jackets & Coats", "Cape"); await rename("Sweaters & Hoodies", "Poncho", "Poncho / cape"); await del("Jackets & Coats", "Raincoat"); await rename("Jackets & Coats", "Windbreaker", "Windbreaker / raincoat");
log("Structure");
await addCat("Activewear");
for (const n of ["Activewear Sports Top", "Activewear Sports Bottom", "Compression Wear"]) await mergeCat(n, "Activewear");
await mergeCat("Polo Shirts", "T-Shirts");
await mergeCat("Suits & Formal", "Jackets & Coats");
const sw = await addCat("Swimwear"); await move("Dresses & Jumpsuits", "Cover-up dress", "Swimwear"); await rename("Swimwear", "Cover-up dress", "Cover-up");
await addSub("Swimwear", "Swimsuit", sub("Activewear", "Sports bra"), "top"); await addSub("Swimwear", "Bikini", sub("Activewear", "Sports bra"), "top");
await addCat("Accessories");
const acc = subs.find((s) => s.name === "Blouse");
for (const n of ["Bag", "Scarf", "Belt", "Hat", "Sunglasses"]) await addSub("Accessories", n, acc, "top");
log("Menu order");
const order = ["Dresses & Jumpsuits", "Tops & Blouses", "T-Shirts", "Shirts", "Sweaters & Hoodies", "Jackets & Coats", "Jeans", "Pants & Trousers", "Skirts", "Shorts", "Activewear", "Swimwear", "Nightwear", "Co-ords & Sets", "Accessories"];
for (let i = 0; i < order.length; i++) { const c = cat(order[i]); if (c) await db.from("categories").update({ sort_order: i + 1 }).eq("slug", c.slug); else log("  missing", order[i]); }
const left = cats.filter((c) => !order.includes(c.name)).map((c) => c.name); if (left.length) log("  not in the order list:", left.join(", "));
log("Done. Women now:", cats.length, "categories,", subs.length, "sub-categories");
