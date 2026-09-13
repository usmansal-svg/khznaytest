/**
 * GET /api/tags/:sku/barcode — Code 128 SVG of the SKU (spec section 6).
 * The SKU string is the whole payload, so no database read is needed.
 * ?bare=1 drops the text under the bars and lets CSS stretch the symbol, for
 * labels that size it in printer dots and print the SKU themselves.
 */

import { toSvg } from "@/lib/barcode/code128";
import { SKU_PATTERN } from "@/lib/pricing/sku";

export async function GET(request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku: raw } = await params;
  const sku = decodeURIComponent(raw).trim().toUpperCase();
  // Demo and legacy codes are allowed through; anything unprintable is not.
  if (!SKU_PATTERN.test(sku) && !/^[A-Z0-9-]{3,32}$/.test(sku)) {
    return new Response("Bad SKU", { status: 400 });
  }
  const bare = new URL(request.url).searchParams.get("bare") === "1";
  const svg = bare ? toSvg(sku, { moduleWidth: 1, height: 36, showText: false, quietZone: 6, stretch: true }) : toSvg(sku, { moduleWidth: 1, height: 36, fontSize: 7 });
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=31536000, immutable" },
  });
}
