/**
 * Drop day and the monthly sweep — spec section 5.
 *
 * Stock is floored on the 1st, all in this month's colour; every month each
 * garment moves one rung down the ladder, so every on-floor garment with a
 * markdown needs a fresh sticker each sweep. Four colours back it is pulled.
 *
 * The commercials desk can override the clock per garment: a held stage
 * (`stage_override`) wins over months on the floor, and a pull request
 * (`pull_requested`) pulls it whatever the month.
 */

import { depthsOf, type LadderStage, type Settings } from "./constants";
import { charm, colourForMonth, coloursBack, stageFor } from "./engine";

export const STICKER: Record<Exclude<LadderStage, "full" | "promo">, string> = {
  md1: "25% OFF",
  md2: "HALF PRICE",
  md3: "LAST CHANCE 75% OFF",
};

export type FloorItem = {
  id: number;
  sku: string;
  outlet_id: number | null;
  sub_category: string;
  brand: string;
  size_label: string | null;
  list_price: number;
  floored_on: string | null;
  colour_tag: string | null;
  status: string;
  stage_override?: LadderStage | null;
  pull_requested?: boolean;
};

export type SweepLine = FloorItem & { stage: LadderStage; sticker: string; price_today: number };

export function sweep(items: FloorItem[], settings: Settings, asOf = new Date()) {
  const current = colourForMonth(asOf);
  const depths = depthsOf(settings);
  const toPull: FloorItem[] = [];
  const stickers: SweepLine[] = [];
  for (const it of items) {
    if (it.status !== "on_floor") continue;
    if (it.pull_requested) {
      toPull.push(it);
      continue;
    }
    if (!it.floored_on && !it.stage_override) continue;
    const stage = it.stage_override ?? stageFor(new Date(it.floored_on!), asOf);
    if (stage === "pull") {
      toPull.push(it);
      continue;
    }
    if (stage === "full" || stage === "promo") continue;
    stickers.push({ ...it, stage, sticker: STICKER[stage], price_today: charm(it.list_price * (1 - depths[stage]), settings) });
  }
  // One sticker type at a time, then sub-category, so the operator works in runs.
  const order: LadderStage[] = ["md1", "md2", "md3"];
  stickers.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || a.sub_category.localeCompare(b.sub_category) || a.sku.localeCompare(b.sku));
  return { colour: current, stickers, to_pull: toPull, months_back: (it: FloorItem) => (it.floored_on ? coloursBack(new Date(it.floored_on), asOf) : null) };
}
