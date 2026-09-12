/**
 * Where a garment is right now, in the words the floor uses. One function so
 * the Items screen, the export and any report agree.
 *
 *   Online:  Tagging → Photography station → Packing station → Online shelf (listed) → Sold
 *   Outlet:  Tagging station → Packing · X → In transit · X → Receiving · X → Stockroom · X → On floor · X → Sold
 *            (a garment never scanned in at the outlet: Missing · X)
 *   Either:  QC rail · Set aside · Pulled · Returned damaged · Rejected · Unlisted
 */

export type StationInput = {
  status: string;
  channel: string | null;
  online_status: string | null;
  qc_hold?: boolean | null;
  photos?: unknown[] | number | null;
  outlet?: string | null;
  received_at?: string | null;
  transfer?: { status: string; outlet: string | null } | null;
};

export function stationOf(i: StationInput): string {
  const photoCount = typeof i.photos === "number" ? i.photos : Array.isArray(i.photos) ? i.photos.length : 0;
  const where = i.outlet ?? i.transfer?.outlet ?? "outlet";
  switch (i.status) {
    case "rejected": return "Rejected";
    case "sold": return "Sold";
    case "pulled": return "Pulled";
    case "returned_damaged": return "Returned damaged";
    case "set_aside": return "Set aside";
    case "missing": return `Missing · ${where}`;
  }
  if (i.qc_hold) return "QC rail";
  if (i.channel === "online") {
    if (i.online_status === "listed") return "Online shelf";
    if (i.online_status === "unlisted") return "Unlisted";
    if (photoCount === 0) return "Photography station";
    return "Packing station";
  }
  if (i.status === "on_floor") return `On floor · ${where}`;
  if (i.received_at) return `Stockroom · ${where}`;
  if (i.transfer) {
    switch (i.transfer.status) {
      case "received": return `Stockroom · ${where}`;
      case "receiving": return `Receiving · ${where}`;
      case "dispatched": case "sent": return `In transit · ${where}`;
      default: return `Packing · ${where}`;
    }
  }
  if (i.outlet) return `Stockroom · ${where}`;
  return "Tagging station";
}
