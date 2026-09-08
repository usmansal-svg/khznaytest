import { connection } from "next/server";

import { PrintTag } from "@/components/print-tag";

export const metadata = { title: "Print tag · Khazanay" };

// Never served from the prerender cache: the SKU is runtime data and
// `instant = false` makes the route blocking (same pattern as /health).
export const instant = false;

// Outside the (app) route group on purpose: no sidebar, nothing but the tag.
// The SKU is runtime data, so this page is never prerendered.
export default async function PrintPage({ params }: { params: Promise<{ sku: string }> }) {
  await connection();
  const { sku } = await params;
  return <PrintTag sku={decodeURIComponent(sku)} />;
}
