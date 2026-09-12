/**
 * Shopify tags for a tagged garment.
 *
 * Collections in Shopify are automated by tag conditions ("tag equals
 * Men Hoodie"), so every garment must carry the same, predictable set of
 * tags. This is the only place they are generated; a collection built on a
 * tag emitted here will always fill itself.
 *
 * Tags are human-readable Title Case so they read well in Shopify admin and
 * in the storefront's filters. Order is stable so exports diff cleanly.
 */

export type TaggableItem = {
  wearer: string | null; // men | women | boy | girl | infant | unisex
  season: string | null; // summer | winter | all_season
  category: string; // e.g. "Winter Men Fashion"
  sub_category: string; // e.g. "Heavy hoodie"
  brand: string | null;
  brand_tier: string | null; // regular | affordable_luxury | ultra_luxury
  grade: string; // bnwt | premium | excellent | very_good
  size_label: string | null;
  colour: string | null;
  fabric: string | null;
  is_rare: boolean;
};

const WEARER: Record<string, string> = {
  men: "Men", women: "Women", unisex: "Unisex",
  teen_boy: "Teen Boys", teen_girl: "Teen Girls", kids_boy: "Kids Boys", kids_girl: "Kids Girls", toddler_boy: "Toddler Boys", toddler_girl: "Toddler Girls", infant_boy: "Infant Boys", infant_girl: "Infant Girls",
  teenage: "Teens", kid: "Kids", toddler: "Toddlers", infant: "Infants", boy: "Boys", girl: "Girls",
};
/** The age band on its own, so a collection can gather both boys and girls. */
const BAND: Record<string, string> = { teen_boy: "Teens", teen_girl: "Teens", kids_boy: "Kids", kids_girl: "Kids", toddler_boy: "Toddlers", toddler_girl: "Toddlers", infant_boy: "Infants", infant_girl: "Infants", teenage: "Teens", toddler: "Toddlers", infant: "Infants", boy: "Kids", girl: "Kids" };
const SEASON: Record<string, string> = { summer: "Summer", winter: "Winter", all_season: "All Season" };
const GRADE: Record<string, string> = { bnwt: "Brand New With Tags", premium: "Premium", excellent: "Excellent", very_good: "Very Good" };
const TIER: Record<string, string> = { affordable_luxury: "Affordable Luxury", ultra_luxury: "Luxury" };

/**
 * The garment type without the wearer prefix the reference data carries:
 * "Men T-shirt" -> "T-shirt", "Women Sports Hoodie" -> "Sports Hoodie",
 * "Kids Jacket" -> "Jacket". Kept as its own tag so "Hoodie" collections
 * span men, women and kids.
 */
export function garmentType(subCategory: string): string {
  return subCategory.replace(/^(Men|Women|Kids)\s+/i, "").trim();
}

function title(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The catalogue gender as the website menu names it: men → Men, women → Women, every child gender → Kids. */
export function menuGender(gender: string | null | undefined): string {
  return gender === "men" ? "Men" : gender === "women" ? "Women" : "Kids";
}

/**
 * The three tags a catalogue node produces, exactly as the Catalogue tree
 * shows them and as Shopify collections should be built on them:
 *   gender "Men" · category "Men Shirts" · sub-category "Men Formal Shirt".
 */
export function menuTags(gender: string | null | undefined, category: string, subCategory?: string | null) {
  const g = menuGender(gender);
  const cat = title(category.trim());
  return { gender: g, category: `${g} ${cat}`, sub: subCategory ? `${g} ${title(garmentType(subCategory))}` : null, type: subCategory ? title(garmentType(subCategory)) : null };
}

export function shopifyTags(item: TaggableItem): string[] {
  const tags: string[] = [];
  const wearer = item.wearer ? WEARER[item.wearer] : undefined;
  const type = title(garmentType(item.sub_category));
  const category = title(item.category.trim());
  const band = item.wearer ? BAND[item.wearer] : undefined;
  const kids = !!item.wearer && !["men", "women", "unisex"].includes(item.wearer);
  // The menu genders this garment belongs under: Men, Women, Kids — both for a unisex adult piece.
  const menus = kids ? ["Kids"] : item.wearer === "unisex" ? ["Men", "Women"] : wearer ? [wearer] : [];

  if (wearer) tags.push(wearer);
  if (band && band !== wearer) tags.push(band);
  if (kids && band !== "Kids" && wearer !== "Kids") tags.push("Kids");
  for (const m of menus) { if (!tags.includes(m)) tags.push(m); tags.push(`${m} ${category}`); tags.push(`${m} ${type}`); }
  tags.push(category);
  tags.push(type);
  if (wearer && !menus.includes(wearer)) tags.push(`${wearer} ${type}`); // "Kids Girls Hoodie"
  if (item.season && SEASON[item.season]) {
    // Season on its own, and combined with wearer and type, so a collection
    // can be built on any of "Summer", "Summer T-Shirt" or "Summer Men T-Shirt".
    tags.push(SEASON[item.season]);
    tags.push(`${SEASON[item.season]} ${type}`);
    if (wearer) tags.push(`${SEASON[item.season]} ${wearer} ${type}`);
  }
  if (item.brand) tags.push(item.brand.trim());
  if (item.brand_tier && TIER[item.brand_tier]) tags.push(TIER[item.brand_tier]);
  if (item.size_label) tags.push(`Size ${item.size_label.trim()}`);
  if (GRADE[item.grade]) tags.push(GRADE[item.grade]);
  if (item.colour) tags.push(title(item.colour.trim()));
  if (item.fabric) tags.push(title(item.fabric.trim()));
  if (item.is_rare) tags.push("Rare Find");
  if (/sport/i.test(item.category) || /sport/i.test(item.sub_category)) tags.push("Sportswear");

  // Shopify treats tags case-insensitively and caps them at 255 chars.
  const seen = new Set<string>();
  return tags.filter((t) => {
    const k = t.toLowerCase();
    if (!t || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Shopify product title: "Nike Heavy Hoodie — Men, Size L" */
export function shopifyTitle(item: TaggableItem): string {
  const wearer = item.wearer ? WEARER[item.wearer] : undefined;
  const parts = [item.brand?.trim() || "Unbranded", title(garmentType(item.sub_category))];
  const detail = [wearer, item.size_label ? `Size ${item.size_label.trim()}` : null].filter(Boolean).join(", ");
  return detail ? `${parts.join(" ")} — ${detail}` : parts.join(" ");
}
