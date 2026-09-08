/**
 * Reprice preview — spec 12.7: nobody should be able to move the whole
 * catalogue without seeing what it does. Prices a representative dozen
 * sub-categories under the current and the proposed settings.
 */

import type { Settings } from "@/lib/pricing/constants";
import { computePrice, profileMultiple } from "@/lib/pricing/engine";
import type { PricingContext } from "@/lib/pricing/repo";

/** The six section-8 rows plus a spread of profiles, weights and kids. */
export const REPRESENTATIVE = [
  "smt-men-t-shirt",
  "smt-men-button-down-shirt",
  "smb-men-jeans",
  "swb-women-jeans",
  "swt-women-dress",
  "sws-sports-bra",
  "wmf-heavy-zip-up",
  "wmf-sweater",
  "wwf-light-puffer-jacket",
  "wmf-leather-jacket",
  "chs-kids-t-shirt",
  "chw-kids-puffer-jacket",
];

export type RepriceRow = {
  slug: string;
  name: string;
  profile: string;
  weight_kg: number;
  current: number;
  proposed: number;
  change_pct: number;
};

export function repricePreview(ctx: PricingContext, proposed: Settings, slugs: string[] = REPRESENTATIVE) {
  const rows: RepriceRow[] = [];
  for (const slug of slugs) {
    const s = ctx.subCategories.find((x) => x.slug === slug);
    if (!s) continue;
    const inputs = { weightKg: s.weightKg, profileCode: s.profileCode, valueIndex: s.valueIndex, perPieceShare: s.perPieceShare, perPieceCost: s.perPieceCost ?? undefined };
    const current = computePrice(inputs, ctx.settings, ctx.refs).premiumPrice;
    const next = computePrice(inputs, proposed, ctx.refs).premiumPrice;
    rows.push({ slug, name: s.name, profile: s.profileCode, weight_kg: s.weightKg, current, proposed: next, change_pct: current ? (next - current) / current : 0 });
  }
  const multiples = (["fast", "standard", "slow"] as const).map((p) => ({
    profile: p,
    current: round4(profileMultiple(p, ctx.settings, ctx.refs)),
    proposed: round4(profileMultiple(p, proposed, ctx.refs)),
  }));
  return { rows, multiples };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
