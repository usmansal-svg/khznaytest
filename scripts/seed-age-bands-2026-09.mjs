/**
 * Give Infants, Toddlers, Kids and Teens each a proper catalogue (13 Sep 2026)
 * and move "Baby" out of Kids into Infants. Numbers for every new
 * sub-category copy from the Kids sub-category with the closest name, else
 * the Kids median. Nothing is deleted except the empty Kids › Baby category.
 *
 *   node scripts/seed-age-bands-2026-09.mjs [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const dry = process.argv.includes("--dry-run");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TREES = {
  infant: [
    ["Bodysuits & Onesies", ["Short sleeve bodysuit", "Long sleeve bodysuit", "Sleeveless bodysuit"]],
    ["Rompers & Sleepsuits", ["Romper", "Sleepsuit", "Dungarees"]],
    ["Sets", ["Baby set", "Top & bottom set", "Gift set"]],
    ["Tops", ["T-shirt", "Shirt", "Vest"]],
    ["Bottoms", ["Leggings", "Trousers", "Shorts", "Joggers"]],
    ["Dresses", ["Baby dress", "Party dress"]],
    ["Sweaters & Cardigans", ["Cardigan", "Sweater", "Hoodie"]],
    ["Jackets & Coats", ["Puffer jacket", "Snowsuit / pramsuit", "Fleece", "Jacket"]],
    ["Nightwear", ["Pajama set", "Sleeping bag", "Nightgown"]],
  ],
  toddler: [
    ["Tops", ["T-shirt", "Long sleeve T-shirt", "Polo shirt", "Shirt", "Blouse", "Tank top"]],
    ["Bottoms", ["Jeans", "Trousers", "Leggings", "Shorts", "Joggers", "Dungarees"]],
    ["Dresses & Skirts", ["Dress", "Party dress", "Skirt", "Romper / playsuit"]],
    ["Sets", ["Two-piece set", "Tracksuit"]],
    ["Sweaters & Hoodies", ["Hoodie", "Sweatshirt", "Sweater", "Cardigan"]],
    ["Jackets & Coats", ["Puffer jacket", "Jacket", "Coat", "Raincoat", "Fleece", "Snowsuit"]],
    ["Nightwear", ["Pajama set", "Sleepsuit"]],
  ],
  teenage: [
    ["T-Shirts", ["Basic T-shirt", "Graphic T-shirt", "Long sleeve T-shirt", "Oversized T-shirt"]],
    ["Polo Shirts", ["Polo shirt"]],
    ["Shirts", ["Casual shirt", "Formal shirt", "Denim shirt", "Flannel shirt"]],
    ["Tops & Blouses", ["Blouse", "Crop top", "Tank top", "Casual top"]],
    ["Jeans", ["Slim jeans", "Straight jeans", "Relaxed jeans", "Ripped jeans"]],
    ["Pants & Trousers", ["Chinos", "Cargo pant", "Joggers", "Leggings", "Casual trouser"]],
    ["Shorts", ["Denim shorts", "Cargo shorts", "Casual shorts"]],
    ["Dresses & Skirts", ["Dress", "Party dress", "Skirt", "Jumpsuit"]],
    ["Sweaters & Hoodies", ["Hoodie", "Zip-up hoodie", "Sweatshirt", "Sweater", "Cardigan"]],
    ["Jackets & Coats", ["Puffer jacket", "Bomber jacket", "Denim jacket", "Coat", "Windbreaker", "Fleece", "Raincoat"]],
    ["Activewear", ["Sports T-shirt", "Sports shorts", "Sports leggings", "Tracksuit", "Sports hoodie"]],
    ["Nightwear", ["Pajama set"]],
  ],
};

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "").replace(/s$/, "");
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const { data: cats } = await db.from("categories").select("slug, name, gender, sort_order, active").not("gender", "is", null);
const { data: subs } = await db.from("sub_categories").select("slug, code, category_slug, gender, name, active, weight_kg, profile_code, value_index, measure_type, season, standard_cost_pkr");
const usedCodes = new Set(subs.map((s) => s.code)), usedSlugs = new Set(subs.map((s) => s.slug));
const kidSubs = subs.filter((s) => s.gender === "kid" && s.standard_cost_pkr != null);
const kidMedian = [...kidSubs].sort((a, b) => Number(a.standard_cost_pkr) - Number(b.standard_cost_pkr))[Math.floor(kidSubs.length / 2)];
const pick = (name) => { const w = name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean); const L = name.toUpperCase().replace(/[^A-Z]/g, ""); const c = [w.map((x) => x[0]).join("").slice(0, 3), L.slice(0, 3), (w[0] ?? "").slice(0, 2) + (w[1]?.[0] ?? ""), L.slice(0, 2) + L.slice(-1)].filter((x) => x.length === 3).find((x) => !usedCodes.has(x)); if (c) { usedCodes.add(c); return c; } for (let i = 0; i < 676; i++) { const x = (L[0] ?? "X") + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)); if (!usedCodes.has(x)) { usedCodes.add(x); return x; } } };
const counts = { catNew: 0, subNew: 0, moved: 0 };

for (const [gender, tree] of Object.entries(TREES)) {
  let order = Math.max(0, ...cats.filter((c) => c.gender === gender).map((c) => c.sort_order));
  for (const [catName, leaves] of tree) {
    let cat = cats.find((c) => c.gender === gender && c.name === catName);
    if (!cat) {
      cat = { slug: `${gender}-${slugify(catName)}`, name: catName, gender, sort_order: ++order, active: true };
      console.log(`NEW category ${gender} ${catName}`); counts.catNew++;
      if (!dry) { const { error } = await db.from("categories").insert(cat); if (error) { console.log("  ERR", error.message); continue; } }
      cats.push(cat);
    }
    const inCat = subs.filter((s) => s.category_slug === cat.slug);
    for (const label of leaves) {
      if (inCat.some((s) => norm(s.name) === norm(label))) continue;
      const model = kidSubs.find((s) => norm(s.name) === norm(label)) ?? kidSubs.find((s) => norm(s.name).includes(norm(label)) || norm(label).includes(norm(s.name))) ?? kidMedian;
      let slug = `${gender}-${slugify(label)}`; for (let i = 2; usedSlugs.has(slug); i++) slug = `${gender}-${slugify(label)}-${i}`; usedSlugs.add(slug);
      const text = `${catName} ${label}`;
      const measure = /dress|skirt|jumpsuit|romper|onesie|bodysuit|sleepsuit|playsuit|dungaree/i.test(text) ? "dress" : /jacket|coat|fleece|snowsuit|outer/i.test(text) ? "outer" : /pant|trouser|jean|short|bottom|legging|jogger|chino/i.test(text) ? "kids_bottom" : "kids_top";
      const row = { slug, code: pick(label), category_slug: cat.slug, gender, name: label, active: true, per_piece_share: 0, weight_kg: model ? Number(model.weight_kg) : 0.2, profile_code: model?.profile_code ?? "standard", value_index: model ? Number(model.value_index) : 1, measure_type: measure, season: model?.season ?? "all", standard_cost_pkr: model?.standard_cost_pkr != null ? Number(model.standard_cost_pkr) : 300 };
      console.log(`NEW ${gender} ${catName} > ${label}  (code ${row.code}, cost ${row.standard_cost_pkr} from ${model?.name ?? "default"})`); counts.subNew++;
      if (!dry) { const { error } = await db.from("sub_categories").insert(row); if (error) console.log("  ERR", error.message); }
      subs.push(row);
    }
  }
}

// Baby belongs to Infants, not Kids: move its sub-categories if unused, then drop the empty Kids › Baby.
const baby = cats.find((c) => c.gender === "kid" && c.name === "Baby");
if (baby) {
  const { count } = await db.from("items").select("id", { count: "exact", head: true }).in("sub_category_slug", subs.filter((s) => s.category_slug === baby.slug).map((s) => s.slug));
  if (count) console.log(`Kids › Baby kept: ${count} garments tagged under it.`);
  else {
    console.log("DELETE Kids › Baby (its sub-categories exist under Infants now)"); counts.moved++;
    if (!dry) { await db.from("sub_categories").delete().eq("category_slug", baby.slug); await db.from("categories").delete().eq("slug", baby.slug); }
  }
}
console.log(dry ? "DRY RUN - nothing written." : "Done.", JSON.stringify(counts));
