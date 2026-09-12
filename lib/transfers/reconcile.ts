/**
 * Closing a transfer's receiving: what was checked in, what never arrived,
 * what turned up that was not on the list. Pure, so it can be tested and so
 * the API and the screen count the same way.
 */

export type ReceiveLine = { sku: string; received_at: string | null; unexpected?: boolean; missing?: boolean; found_at?: string | null };

export type Reconciliation = { received: string[]; missing: string[]; unexpected: string[] };

export function reconcile(lines: ReceiveLine[]): Reconciliation {
  const received: string[] = [], missing: string[] = [], unexpected: string[] = [];
  for (const l of lines) {
    if (l.unexpected) unexpected.push(l.sku);
    else if (l.received_at) received.push(l.sku);
    else missing.push(l.sku);
  }
  return { received, missing, unexpected };
}

/** Transfer status wording for staff, in the order the box travels. */
export const TRANSFER_STEPS = ["packing", "dispatched", "receiving", "received"] as const;
export type TransferStatus = (typeof TRANSFER_STEPS)[number];
export const TRANSFER_LABEL: Record<TransferStatus, string> = { packing: "Packing", dispatched: "In transit", receiving: "Receiving", received: "Received" };
