/**
 * GET /api/tags/:sku/qr — QR code SVG of the SKU, for the label's phone-scannable corner.
 */
import { qrSvg } from "@/lib/barcode/qr";
import { SKU_PATTERN } from "@/lib/pricing/sku";

export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku: raw } = await params;
  const sku = decodeURIComponent(raw).trim().toUpperCase();
  if (!SKU_PATTERN.test(sku) && !/^[A-Z0-9-]{3,32}$/.test(sku)) return new Response("Bad SKU", { status: 400 });
  return new Response(await qrSvg(sku), { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=31536000, immutable" } });
}
