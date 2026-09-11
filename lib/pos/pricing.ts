import { DEFAULT_SETTINGS, type LadderStage, type Settings } from "@/lib/pricing/constants";
import { markdownLadder, stageFor } from "@/lib/pricing/engine";

export type SaleStage = Exclude<LadderStage, "promo">;

export const STAGE_LABELS: Record<SaleStage | "pull", string> = {
  full: "Full price",
  md1: "25% off",
  md2: "Half price",
  md3: "75% off",
  pull: "75% off (due to pull)",
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
  outlet_id: number | null;
  outlet: string | null;
  list_price: number;
  stage: SaleStage | "pull";
  price: number;
  days_on_floor: number | null;
  is_rare: boolean;
  online_listed: boolean;
};

/** Shelf price today: the tagged price walked down the ladder by months on the floor. */
export function currentPrice(listPrice: number, flooredOn: string | null, settings: Settings = DEFAULT_SETTINGS, asOf = new Date()): { stage: SaleStage | "pull"; price: number } {
  if (!flooredOn) return { stage: "full", price: listPrice };
  const stage = stageFor(new Date(flooredOn), asOf) as SaleStage | "pull";
  if (stage === "full") return { stage, price: listPrice };
  const ladder = markdownLadder(listPrice, settings);
  const rung = ladder.find((m) => m.stage === (stage === "pull" ? "md3" : stage))!;
  return { stage, price: rung.price };
}

export const soldStageOf = (stage: SaleStage | "pull"): SaleStage => (stage === "pull" ? "md3" : stage);

export const daysOnFloor = (flooredOn: string | null, asOf = new Date()) => (flooredOn ? Math.max(0, Math.floor((asOf.getTime() - new Date(flooredOn).getTime()) / 86400_000)) : null);
