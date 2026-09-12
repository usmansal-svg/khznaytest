/**
 * Seed the catalogue to the 12 Sep 2026 proposal (docs/SHOPIFY-CATALOGUE.md):
 * creates missing categories and sub-categories, renames the existing broad
 * ones to the proposal's names, and switches off everything in a covered
 * category that the proposal does not list. Nothing is deleted.
 *
 *   node scripts/seed-catalogue-2026-09.mjs            apply
 *   node scripts/seed-catalogue-2026-09.mjs --dry-run  only report
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const dry = process.argv.includes("--dry-run");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const N = "new", H = "have", R = "retire";
const DATA={
  Men:{tag:"Men",cats:[
    ["T-Shirts",[["Basic T-shirt",H,"Men T-shirt"],["Graphic T-shirt",N],["Long sleeve T-shirt",N],["Henley",N],["V-neck T-shirt",N],["Oversized T-shirt",N]]],
    ["Polo Shirts",[["Polo shirt",H],["Long sleeve polo",N]]],
    ["Shirts",[["Formal shirt",N],["Casual shirt",N],["Denim shirt",N],["Flannel shirt",N],["Linen shirt",N],["Printed shirt",N],["Overshirt",N],["Button-down shirt",R]]],
    ["Sweaters & Hoodies",[["Hoodie",N],["Zip-up hoodie",N],["Sweatshirt",H],["Crewneck sweater",H,"Sweater"],["Cardigan",N],["Half-zip pullover",N],["Turtleneck",N],["Knit vest",N],["Heavy hoodie",R],["Light hoodie",R],["Heavy zip-up",R],["Light zip-up",R]]],
    ["Jackets & Coats",[["Puffer jacket",N],["Bomber jacket",N],["Denim jacket",N],["Leather jacket",H],["Overcoat",N],["Trench coat",N],["Parka",N],["Windbreaker",N],["Fleece jacket",N],["Gilet / Vest",N],["Blazer",H],["Raincoat",N]]],
    ["Jeans",[["Slim jeans",N],["Straight jeans",N],["Regular jeans",N],["Relaxed / baggy jeans",N],["Ripped jeans",N],["Denim shorts",N],["Men Jeans",R]]],
    ["Pants & Trousers",[["Chinos",H,"Cotton pants / chinos"],["Dress pant",H],["Casual trouser",N],["Cargo pant",N],["Corduroy pant",N],["Linen trouser",N],["Nightwear pajama",N]]],
    ["Shorts",[["Chino shorts",N],["Cargo shorts",N],["Casual shorts",N],["Men Shorts",R]]],
    ["Activewear Sports Top",[["Sports T-shirt",H],["Sports polo",H,"Sports Polo T-shirt"],["Sports tank top",N],["Sports stringer",N],["Sports jersey",N],["Sports shirt",N],["Sports zip-up",H],["Half-zip sports pullover",N],["Sports hoodie",H],["Long sleeve sports top",H,"Long sleeve T-shirt"],["Cycling top",N],["Baseball shirt",N],["Basketball jersey",N]]],
    ["Activewear Sports Bottom",[["Sports shorts",H],["Sports sweatpants",H],["Track pant / sports trouser",N],["Swimming shorts",N],["Cycling shorts",N],["Golf pant",N],["American football pant",N]]],
    ["Compression Wear",[["Compression top",N],["Compression tights",N],["Compression shorts",N]]],
    ["Suits & Formal",[["Suit jacket",N],["Suit trouser",N],["Waistcoat",N],["Tuxedo jacket",N]],true],
    ["Nightwear & Loungewear",[["Pajama set",N],["Lounge pant",N],["Robe",N]],true],
  ]},
  Women:{tag:"Women",cats:[
    ["Tops & Blouses",[["Blouse",H],["Casual top",H,"Women Top"],["Formal top",N],["Party top",N],["Crop top",N],["Off-shoulder top",N],["Casual tank top",N],["Camisole",N],["Tunic",N],["Summer knit",N],["Peplum top",N]]],
    ["T-Shirts",[["Basic T-shirt",H,"Women T-shirt"],["Graphic T-shirt",N],["Long sleeve T-shirt",N],["Oversized T-shirt",N]]],
    ["Polo Shirts",[["Polo shirt",H]]],
    ["Shirts",[["Formal shirt",N],["Casual shirt",N],["Denim shirt",N],["Flannel shirt",N],["Linen shirt",N],["Oversized shirt",N],["Button-down shirt",R]]],
    ["Dresses & Jumpsuits",[["Short dress",N],["Midi dress",N],["Long / maxi dress",N],["Party dress",N],["Shirt dress",N],["Knit dress",N],["Cover-up dress",N],["Bodysuit",N],["Jumpsuit",N],["Playsuit / romper",N],["Women Dress",R]]],
    ["Skirts",[["Mini skirt",N],["Midi skirt",N],["Maxi skirt",N],["Denim skirt",N],["Pleated skirt",N],["Women Skirt",R]]],
    ["Jeans",[["Skinny jeans",N],["Straight jeans",N],["Mom jeans",N],["Wide-leg jeans",N],["Bootcut / flared jeans",N],["Ripped jeans",N],["Denim shorts",N],["Women Jeans",R]]],
    ["Pants & Trousers",[["Casual trouser",H,"Casual pants"],["Dress pant",N],["Cargo pant",N],["Legging",N],["Palazzo",H],["Wide-leg trouser",N],["Culottes",N],["Corduroy pant",N],["Sweatpants",H]]],
    ["Shorts",[["Denim shorts",N],["Casual shorts",N],["Skort",N],["Women Shorts",R]]],
    ["Sweaters & Hoodies",[["Hoodie",N],["Zip-up hoodie",N],["Sweatshirt",H],["Crewneck sweater",H,"Sweater"],["Cardigan",N],["Turtleneck",N],["Knit vest",N],["Poncho",N]]],
    ["Jackets & Coats",[["Puffer jacket",N],["Bomber jacket",N],["Denim jacket",N],["Leather jacket",H],["Overcoat",N],["Trench coat",N],["Parka",N],["Windbreaker",N],["Fleece jacket",N],["Gilet / Vest",N],["Blazer",H],["Raincoat",N],["Cape",N]]],
    ["Activewear Sports Top",[["Sports T-shirt",H],["Sports tank top",N],["Sports bra",H],["Sports zip-up",H],["Sports hoodie",H],["Sports jersey",N],["Long sleeve sports top",H,"Long sleeve T-shirt"],["Sports polo",H,"Long sleeve Polo"]]],
    ["Activewear Sports Bottom",[["Sports leggings",N],["Sports shorts",H],["Sweatpants",N],["Track pant",N],["Cycling shorts",N],["Yoga pant",N],["Skort",N]]],
    ["Compression Wear",[["Compression top",N],["Compression tights",N]]],
    ["Nightwear",[["Pajama set",H,"Reon Pajama"],["Nightdress",N],["Robe",N],["Loungewear set",N]]],
    ["Suits & Formal",[["Waistcoat",N],["Suit jacket",N],["Suit trouser",N]],false,"rename of Waistcoats"],
    ["Co-ords & Sets",[["Two-piece set",N],["Tracksuit",N]],true],
  ]},
  Kids:{tag:"Kids",cats:[
    ["Tops",[["T-shirt",H],["Polo shirt",H],["Shirt",N],["Blouse",N],["Tank top",N],["Long sleeve T-shirt",N]]],
    ["Bottoms",[["Jeans",N],["Trousers",H],["Shorts",H],["Leggings",N],["Joggers / sweatpants",H,"Sweatpants"],["Cargo pant",N]]],
    ["Dresses & Skirts",[["Dress",H],["Skirt",H],["Jumpsuit / romper",N],["Party dress",N]]],
    ["Sweaters & Hoodies",[["Hoodie",H],["Sweatshirt",H],["Sweater",H],["Cardigan",N],["Zip-up hoodie",N]]],
    ["Jackets & Coats",[["Puffer jacket",H],["Jacket",H],["Coat",N],["Raincoat",N],["Fleece",N]]],
    ["Activewear",[["Sports T-shirt",N],["Sports shorts",N],["Tracksuit",N],["Sports leggings",N]],true],
    ["Nightwear",[["Pajama set",N],["Sleepsuit",N]],true],
    ["Baby",[["Bodysuit / onesie",N],["Romper",N],["Sleepsuit",N],["Baby set",N],["Baby dress",N]],true,"infants and toddlers"],
  ]},
};

const GENDER = { Men: "men", Women: "women", Kids: "kid" };
const RENAME_CATEGORY = { women: { "Waistcoats": "Suits & Formal" } };
const norm = (s) => s.toLowerCase().replace(/^(men|women|kids)\s+/, "").replace(/[^a-z]/g, "").replace(/s$/, "");
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const log = (...a) => console.log(...a);

const { data: cats } = await db.from("categories").select("slug, name, gender, sort_order, active").not("gender", "is", null);
const { data: subs } = await db.from("sub_categories").select("slug, code, category_slug, gender, name, active, weight_kg, profile_code, value_index, measure_type, season, standard_cost_pkr");
const usedCodes = new Set(subs.map((s) => s.code)), usedSlugs = new Set(subs.map((s) => s.slug));
const pick = (name) => { const w = name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean); const L = name.toUpperCase().replace(/[^A-Z]/g, ""); const c = [w.map((x) => x[0]).join("").slice(0, 3), L.slice(0, 3), (w[0] ?? "").slice(0, 2) + (w[1]?.[0] ?? ""), L.slice(0, 2) + L.slice(-1)].filter((x) => x.length === 3).find((x) => !usedCodes.has(x)); if (c) { usedCodes.add(c); return c; } for (let i = 0; i < 676; i++) { const x = L[0] + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)); if (!usedCodes.has(x)) { usedCodes.add(x); return x; } } };
const counts = { catNew: 0, subNew: 0, renamed: 0, off: 0, on: 0 };

for (const [tab, branch] of Object.entries(DATA)) {
  const gender = GENDER[tab];
  let order = Math.max(0, ...cats.filter((c) => c.gender === gender).map((c) => c.sort_order));
  for (const [catName, leaves] of branch.cats) {
    const renamedFrom = Object.entries(RENAME_CATEGORY[gender] ?? {}).find(([, to]) => to === catName)?.[0];
    let cat = cats.find((c) => c.gender === gender && (c.name === catName || (renamedFrom && c.name === renamedFrom)));
    if (cat && renamedFrom && cat.name === renamedFrom) { log(`RENAME category ${gender} ${cat.name} -> ${catName}`); if (!dry) await db.from("categories").update({ name: catName }).eq("slug", cat.slug); cat.name = catName; counts.renamed++; }
    if (!cat) {
      cat = { slug: `${gender}-${slugify(catName)}`, name: catName, gender, sort_order: ++order, active: true };
      log(`NEW category ${gender} ${catName}`); counts.catNew++;
      if (!dry) { const { error } = await db.from("categories").insert(cat); if (error) { log("  ERR", error.message); continue; } }
      cats.push(cat);
    } else if (!cat.active) { log(`ON category ${catName}`); if (!dry) await db.from("categories").update({ active: true }).eq("slug", cat.slug); }
    const inCat = subs.filter((s) => s.category_slug === cat.slug);
    const keep = new Set();
    const genderSubs = subs.filter((s) => s.gender === gender && s.standard_cost_pkr != null).sort((a, b) => Number(a.standard_cost_pkr) - Number(b.standard_cost_pkr));
    const model = [...inCat].sort((a, b) => Number(b.standard_cost_pkr ?? 0) - Number(a.standard_cost_pkr ?? 0))[0] ?? genderSubs[Math.floor(genderSubs.length / 2)];
    for (const [label, kind, alias] of leaves) {
      if (kind === R) continue;
      const want = norm(label), aliasN = alias ? norm(alias) : null;
      const hit = inCat.find((s) => norm(s.name) === want) ?? (aliasN ? inCat.find((s) => norm(s.name) === aliasN) : null);
      if (hit) {
        keep.add(hit.slug);
        if (hit.name !== label) { log(`RENAME ${gender} ${hit.name} -> ${label}`); counts.renamed++; if (!dry) await db.from("sub_categories").update({ name: label }).eq("slug", hit.slug); hit.name = label; }
        if (!hit.active) { log(`ON ${gender} ${label}`); counts.on++; if (!dry) await db.from("sub_categories").update({ active: true }).eq("slug", hit.slug); hit.active = true; }
        continue;
      }
      let slug = `${gender}-${slugify(label)}`; for (let i = 2; usedSlugs.has(slug); i++) slug = `${gender}-${slugify(label)}-${i}`; usedSlugs.add(slug);
      const kids = gender === "kid";
      const text = `${catName} ${label}`;
      const measure = model?.measure_type ?? (/dress|skirt|jumpsuit|romper|onesie|bodysuit/i.test(text) ? "dress" : /jacket|coat|blazer|gilet|parka|cape|outer/i.test(text) ? "outer" : /pant|trouser|jean|short|bottom|legging|skort|jogger|tights/i.test(text) ? (kids ? "kids_bottom" : "bottom") : kids ? "kids_top" : "top");
      const row = { slug, code: pick(label), category_slug: cat.slug, gender, name: label, active: true, per_piece_share: 0, weight_kg: model ? Number(model.weight_kg) : 0.3, profile_code: model?.profile_code ?? "standard", value_index: model ? Number(model.value_index) : 1, measure_type: measure, season: model?.season ?? "all", standard_cost_pkr: model?.standard_cost_pkr != null ? Number(model.standard_cost_pkr) : 500 };
      log(`NEW ${gender} ${catName} > ${label}  (code ${row.code}, cost ${row.standard_cost_pkr} from ${model?.name ?? "default"})`); counts.subNew++;
      if (!dry) { const { error } = await db.from("sub_categories").insert(row); if (error) log("  ERR", error.message); }
      subs.push(row); keep.add(slug);
    }
    for (const s of inCat) if (!keep.has(s.slug) && s.active) { log(`OFF ${gender} ${catName} > ${s.name}`); counts.off++; if (!dry) await db.from("sub_categories").update({ active: false }).eq("slug", s.slug); }
  }
}
log(dry ? "DRY RUN - nothing written." : "Done.", JSON.stringify(counts));
