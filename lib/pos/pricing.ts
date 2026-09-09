import { DEFAULT_SETTINGS, type LadderStage } from "@/lib/pricing/constants";
import { markdownLadder, stageFor } from "@/lib/pricing/engine";

export type SaleStage = Exclude<LadderStage, "promo">;

export const STAGE_LABELS: Record<SaleStage, string> = {
  full: "Full price",
  md1: "25% off",
  md2: "Half price",
  md3: "75% off",
};

export type PosItem = {
  id: number;
  sku: string;
  brand: string;
  sub_category: string;
  grade: string;
  size_label: string | null;
  colour_tag: string | null;
  status: string;
  list_price: number;
  stage: SaleStage | "pull";
  price: number;
};

/** Shelf price today: the tagged price walked down the colour ladder. */
export function currentPrice(
  listPrice: number,
  flooredOn: string | null,
  asOf = new Date(),
): { stage: SaleStage | "pull"; price: number } {
  if (!flooredOn) return { stage: "full", price: listPrice };
  const stage = stageFor(new Date(flooredOn), asOf) as SaleStage | "pull";
  if (stage === "full") return { stage, price: listPrice };
  const ladder = markdownLadder(listPrice, DEFAULT_SETTINGS);
  // A piece due to be pulled still sells, at the deepest rung.
  const rung = ladder.find((m) => m.stage === (stage === "pull" ? "md3" : stage))!;
  return { stage, price: rung.price };
}
