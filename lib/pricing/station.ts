/**
 * Where a garment is right now, in the words the floor uses. One function so
 * the Items screen, the export and any report agree.
 *
 *   Online:  Tagging → Photography station → Packing station → Online shelf (listed) → Sold
 *   Outlet:  Tagging → Being packed for X → In transit to X → At X → Sold
 *   Either:  QC rail · Set aside · Pulled · Returned damaged · Rejected · Unlisted
 */

export type StationInput = {
  status: string;
  channel: string | null;
  online_status: string | null;
  qc_hold?: boolean | null;
  photos?: unknown[] | number | null;
  outlet?: string | null;
  transfer?: { status: string; outlet: string | null } | null;
};

export function stationOf(i: StationInput): string {
  const photoCount = typeof i.photos === "number" ? i.photos : Array.isArray(i.photos) ? i.photos.length : 0;
  switch (i.status) {
    case "rejected": return "Rejected";
    case "sold": return "Sold";
    case "pulled": return "Pulled";
    case "returned_damaged": return "Returned damaged";
    case "set_aside": return "Set aside";
  }
  if (i.qc_hold) return "QC rail";
  if (i.channel === "online") {
    if (i.online_status === "listed") return "Online shelf";
    if (i.online_status === "unlisted") return "Unlisted";
    if (photoCount === 0) return "Photography station";
    return "Packing station";
  }
  if (i.status === "on_floor" && i.outlet) return `At ${i.outlet}`;
  if (i.transfer) {
    if (i.transfer.status === "received") return i.outlet ? `At ${i.outlet}` : "Received";
    if (i.transfer.status === "sent") return `In transit to ${i.transfer.outlet ?? "outlet"}`;
    return `Being packed for ${i.transfer.outlet ?? "outlet"}`;
  }
  if (i.outlet) return `At ${i.outlet}`;
  return "Tagging station";
}
