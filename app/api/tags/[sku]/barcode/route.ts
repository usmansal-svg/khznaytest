/**
 * GET /api/tags/:sku/barcode — Code 128 SVG of the SKU (spec section 6).
 * The SKU string is the whole payload, so no database read is needed.
 */

import { toSvg } from "@/lib/barcode/code128";
import { SKU_PATTERN } from "@/lib/pricing/sku";

export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku: raw } = await params;
  const sku = decodeURIComponent(raw).trim().toUpperCase();
  // Demo and legacy codes are allowed through; anything unprintable is not.
  if (!SKU_PATTERN.test(sku) && !/^[A-Z0-9-]{3,32}$/.test(sku)) {
    return new Response("Bad SKU", { status: 400 });
  }
  const svg = toSvg(sku, { moduleWidth: 1, height: 36, fontSize: 7 });
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=31536000, immutable" },
  });
}
