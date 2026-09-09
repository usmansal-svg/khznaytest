/**
 * Lot P&L — spec v2 section 7. Rolls tagged items up by lot: pieces, kg
 * tagged, % done, cost of lot, cost tagged, expected revenue, expected GP,
 * GP %, rejects against the 3% assumption. Compare lots on GP per piece,
 * not GP % — a cheap lot yielding light garments can beat a dear one
 * yielding few heavy ones.
 */

import { REJECTED, type GradeCode, type ProfileCode, type Settings } from "./constants";
import { expectedRevenue, type PricingRefs } from "./engine";
import type { DbLot, DbSubCategory } from "./repo";

export type LotItem = {
  lot_id: number;
  weight_kg: number | null;
  landed_cost: number;
  price: number | null;
  price_manual: number | null;
  grade_code: GradeCode;
  sub_category_slug: string;
  status: string;
};

export type LotPnl = {
  pieces: number;
  rejects: number;
  reject_pct: number;
  kg_tagged_so_far: number;
  pct_done: number | null;
  /** What was paid for the whole lot, landed (kg lots only; null for pc) */
  lot_cost: number | null;
  cost_tagged: number;
  expected_revenue: number;
  expected_gp: number;
  gp_pct: number;
  gp_per_piece: number;
  sold: number;
  sold_revenue: number;
};

export function lotPnl(lot: DbLot, items: LotItem[], subCategories: DbSubCategory[], settings: Settings, refs: PricingRefs): LotPnl {
  const profileOf = new Map(subCategories.map((s) => [s.slug, s.profileCode]));
  let pieces = 0, rejects = 0, kg = 0, cost = 0, expected = 0, sold = 0, soldRevenue = 0;

  for (const it of items) {
    pieces += 1;
    kg += Number(it.weight_kg ?? 0);
    const landed = Number(it.landed_cost);
    cost += landed;
    if (it.grade_code === REJECTED) rejects += 1;
    const price = it.price_manual ?? it.price ?? 0;
    expected += expectedRevenue({ price, landedCost: landed, gradeCode: it.grade_code, profileCode: (profileOf.get(it.sub_category_slug) ?? "standard") as ProfileCode }, settings, refs);
    if (it.status === "sold") {
      sold += 1;
      soldRevenue += price;
    }
  }

  // Landed cost of everything bought, for kg lots: kg × rate × fx + duty,
  // less recoverable input tax. Per-piece lots have no fixed quantity.
  const taxCredit = lot.imported ? 1 - settings.inputTaxRate * settings.inputTaxRecover : 1;
  const lotCost =
    lot.basis === "kg" && lot.kgBought && lot.rate
      ? (lot.kgBought * lot.rate * settings.fx + (lot.imported ? lot.kgBought * settings.dutyPerKg : 0)) * taxCredit
      : lot.basis === "pc" && lot.pieces && lot.rate
        ? lot.pieces * lot.rate * taxCredit
        : null;

  const gp = expected - cost;
  return {
    pieces,
    rejects,
    reject_pct: pieces ? rejects / pieces : 0,
    kg_tagged_so_far: round3(kg),
    pct_done: lot.basis === "kg" && lot.kgBought ? Math.min(1, kg / (lot.kgBought * lot.yield)) : lot.basis === "pc" && lot.pieces ? Math.min(1, pieces / lot.pieces) : null,
    lot_cost: lotCost == null ? null : Math.round(lotCost),
    cost_tagged: Math.round(cost),
    expected_revenue: Math.round(expected),
    expected_gp: Math.round(gp),
    gp_pct: expected ? gp / expected : 0,
    gp_per_piece: pieces ? Math.round(gp / pieces) : 0,
    sold,
    sold_revenue: soldRevenue,
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
