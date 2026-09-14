/**
 * The three brand tiers as the shop talks about them, with the short code
 * that goes on the tag: HS (high street), AL (affordable luxury), UL (ultra
 * luxury). Plain data, safe to import from client components and the print
 * helper alike.
 */
export type BrandTierCode = "regular" | "affordable_luxury" | "ultra_luxury";

export const BRAND_TIER_INFO: readonly { tier: BrandTierCode; code: string; label: string; hint: string }[] = [
  { tier: "regular", code: "HS", label: "High street", hint: "Zara, H&M, Next, Primark… priced by the sheet" },
  { tier: "affordable_luxury", code: "AL", label: "Affordable luxury", hint: "Tommy Hilfiger, Ralph Lauren, Hugo Boss… priced at the AL multiple" },
  { tier: "ultra_luxury", code: "UL", label: "Ultra luxury", hint: "Gucci, Burberry, Prada… set aside and priced by hand" },
];

export const isBrandTier = (v: unknown): v is BrandTierCode => BRAND_TIER_INFO.some((t) => t.tier === v);
export const tierCode = (tier: string | null | undefined): string => BRAND_TIER_INFO.find((t) => t.tier === tier)?.code ?? "HS";
export const tierLabel = (tier: string | null | undefined): string => BRAND_TIER_INFO.find((t) => t.tier === tier)?.label ?? String(tier ?? "");
