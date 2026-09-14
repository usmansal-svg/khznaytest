/**
 * The 2.25 × 1.5 in label as native ZPL for Zebra printers (203 dpi): the
 * same arrangement as the HTML layout — brand, garment type, size, the price
 * in its box, SKU, and a QR code on the right — but drawn by the printer
 * itself, so nothing is rasterised and the label is out in under a second.
 */
import type { TagItem } from "@/components/tag-faces";

const DPI = 203;
const dots = (mm: number) => Math.round((mm / 25.4) * DPI);

/** ZPL field data: ^ ~ and \ are command characters. Non-ASCII is fine under ^CI28 (UTF-8). */
const esc = (s: string) => s.replace(/[\^~\\]/g, " ");
const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);
const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-PK")}/-`;

export function zplLabel225x15(item: TagItem, opts: { thermalTransfer?: boolean; darkness?: number; copies?: number } = {}): string {
  const W = dots(57.15), H = dots(38.1);
  const left = dots(2);
  const price = rs(item.list_price);
  // The QR: model 2, magnification 6 → 21 modules × 6 dots ≈ 16 mm for a 16-character SKU, with a 3 mm quiet zone.
  const qrMag = 6, qrSide = 21 * qrMag + 2 * 4 * qrMag; // modules + quiet, in dots
  const qrX = W - qrSide + 4 * qrMag - dots(1), qrY = Math.round((H - 21 * qrMag) / 2);
  const priceW = Math.min(W - left - qrSide - dots(1), Math.round(price.length * 21 + 30));
  return [
    "^XA", "^CI28", `^PW${W}`, `^LL${H}`, "^LH0,0", opts.thermalTransfer ? "^MTT" : "^MTD", opts.darkness != null ? `^MD${opts.darkness}` : "",
    `^FO${left},${dots(2)}^A0N,30,30^FB${W - left - qrSide},1,0,L^FD${esc(cut((item.is_rare ? "★ " : "") + (item.brand || "Unbranded"), 26))}^FS`,
    `^FO${left},${dots(2) + 34}^A0N,22,22^FB${W - left - qrSide},1,0,L^FD${esc(cut(item.sub_category, 34))}^FS`,
    `^FO${left},${dots(17.5)}^A0N,18,18^FDSIZE^FS`,
    `^FO${left + 56},${dots(17.5) - 12}^A0N,38,38^FD${esc(cut(item.size_label ?? "—", 10))}^FS`,
    `^FO${left},${dots(23)}^GB${priceW},${dots(7.5)},3,B,2^FS`,
    `^FO${left + 14},${dots(23) + 14}^A0N,40,40^FD${esc(price)}^FS`,
    `^FO${left},${dots(32.2)}^A0N,20,20^FD${esc(item.sku)}^FS`,
    `^FO${qrX},${qrY}^BQN,2,${qrMag}^FDQA,${esc(item.sku)}^FS`,
    opts.copies && opts.copies > 1 ? `^PQ${opts.copies}` : "",
    "^XZ",
  ].filter(Boolean).join("\n");
}
