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
  const qrX = W - qrSide + 4 * qrMag - dots(1), qrY = Math.round((H - 21 * qrMag) / 2) + dots(1.5);
  const priceW = Math.min(W - left - qrSide - dots(1), Math.round(price.length * 21 + 30));
  return [
    "^XA", "^CI28", "^MNW", `^PW${W}`, `^LL${H}`, "^LH0,0", opts.thermalTransfer ? "^MTT" : "^MTD", opts.darkness != null ? `^MD${opts.darkness}` : "",
    // Rare find: a black band with white text above the brand; the reason replaces the garment type.
    ...(item.is_rare ? [`^FO${left},${dots(1.5)}^GB${dots(22)},${dots(3.6)},${dots(3.6)},B,1^FS`, `^FO${left + 8},${dots(1.5) + 8}^A0N,20,20^FR^FDRARE FIND^FS`] : []),
    `^FO${left},${item.is_rare ? dots(5.6) : dots(2)}^A0N,30,30^FB${W - left - qrSide},1,0,L^FD${esc(cut(item.brand || "Unbranded", 26))}^FS`,
    `^FO${left},${(item.is_rare ? dots(5.6) : dots(2)) + 34}^A0N,22,22^FB${W - left - qrSide},1,0,L^FD${esc(cut(item.is_rare && item.rare_tag_line ? item.rare_tag_line : item.sub_category, 34))}^FS`,
    `^FO${left},${dots(17.5)}^A0N,18,18^FDSIZE^FS`,
    `^FO${left + 56},${dots(17.5) - 12}^A0N,38,38^FD${esc(cut(item.size_label ?? "—", 10))}^FS`,
    `^FO${left},${dots(23)}^GB${priceW},${dots(7.5)},3,B,2^FS`,
    `^FO${left + 14},${dots(23) + 14}^A0N,40,40^FD${esc(price)}^FS`,
    `^FO${left},${dots(32.2)}^A0N,20,20^FD${esc(item.sku)}^FS`,
    `^FO${qrX},${qrY}^BQN,2,${qrMag}^FDQA,${esc(item.sku)}^FS`,
    `^FO${W - dots(2) - 150},${dots(2.2)}^A0N,20,20^FB150,1,0,R^FDKHAZANAY^FS`,
    opts.copies && opts.copies > 1 ? `^PQ${opts.copies}` : "",
    "^XZ",
  ].filter(Boolean).join("\n");
}

/**
 * The portrait 1.5 × 2.25 in label (38.1 × 57.15 mm) as ZPL: wordmark, brand
 * and type top left; the QR top right; size and the boxed price below; the
 * SKU bottom left; the bottom-right corner empty for the round markdown
 * sticker. Mirrors TagLabelPortrait in components/tag-faces.tsx.
 */
export function zplLabel15x225(item: TagItem, opts: { thermalTransfer?: boolean; darkness?: number; copies?: number } = {}): string {
  const W = dots(38.1), H = dots(57.15);
  const left = dots(2);
  const price = rs(item.list_price);
  const qrMag = 5; // 21 modules × 5 dots ≈ 13 mm
  const qrX = W - 21 * qrMag - dots(1.5), qrY = dots(1.5);
  const textW = qrX - left - dots(1.5);
  const priceW = Math.min(W - 2 * left, Math.round(price.length * 21 + 34));
  const typeLine = item.is_rare ? `★ RARE FIND${item.rare_tag_line ? ` · ${item.rare_tag_line}` : ""}` : item.sub_category;
  return [
    "^XA", "^CI28", "^MNW", `^PW${W}`, `^LL${H}`, "^LH0,0", opts.thermalTransfer ? "^MTT" : "^MTD", opts.darkness != null ? `^MD${opts.darkness}` : "",
    `^FO${left},${dots(1.8)}^A0N,20,22^FDKHAZANAY^FS`,
    `^FO${left},${dots(5.2)}^A0N,30,30^FB${textW},1,0,L^FD${esc(cut(item.brand || "Unbranded", 18))}^FS`,
    `^FO${left},${dots(9.6)}^A0N,20,20^FB${textW},2,0,L^FD${esc(cut(typeLine, 40))}^FS`,
    `^FO${qrX},${qrY}^BQN,2,${qrMag}^FDQA,${esc(item.sku)}^FS`,
    `^FO${left},${dots(19.6)}^A0N,18,18^FDSIZE^FS`,
    `^FO${left + 52},${dots(19.6) - 14}^A0N,40,40^FD${esc(cut(item.size_label ?? "—", 10))}^FS`,
    `^FO${left},${dots(24.4)}^GB${priceW},${dots(7.6)},3,B,2^FS`,
    `^FO${left + 16},${dots(24.4) + 16}^A0N,42,42^FD${esc(price)}^FS`,
    `^FO${left},${dots(53.6)}^A0N,18,18^FD${esc(item.sku)}^FS`,
    opts.copies && opts.copies > 1 ? `^PQ${opts.copies}` : "",
    "^XZ",
  ].filter(Boolean).join("\n");
}

/** The 5 × 5 cm square label as ZPL. Mirrors TagLabelSquare in components/tag-faces.tsx. */
export function zplLabel50x50(item: TagItem, opts: { thermalTransfer?: boolean; darkness?: number; copies?: number } = {}): string {
  const W = dots(50), H = dots(50);
  const left = dots(2.2);
  const price = rs(item.list_price);
  const qrMag = 6; // 21 × 6 dots ≈ 15.8 mm
  const qrX = W - 21 * qrMag - dots(1.5), qrY = dots(1.5);
  const textW = qrX - left - dots(1.5);
  const priceW = Math.min(W - 2 * left, Math.round(price.length * 23 + 36));
  const typeLine = item.is_rare ? `★ RARE FIND${item.rare_tag_line ? ` · ${item.rare_tag_line}` : ""}` : item.sub_category;
  return [
    "^XA", "^CI28", "^MNW", `^PW${W}`, `^LL${H}`, "^LH0,0", opts.thermalTransfer ? "^MTT" : "^MTD", opts.darkness != null ? `^MD${opts.darkness}` : "",
    `^FO${left},${dots(2)}^A0N,22,24^FDKHAZANAY^FS`,
    `^FO${left},${dots(5.6)}^A0N,34,34^FB${textW},1,0,L^FD${esc(cut(item.brand || "Unbranded", 18))}^FS`,
    `^FO${left},${dots(10.2)}^A0N,22,22^FB${textW},2,0,L^FD${esc(cut(typeLine, 44))}^FS`,
    `^FO${qrX},${qrY}^BQN,2,${qrMag}^FDQA,${esc(item.sku)}^FS`,
    `^FO${left},${dots(21.5)}^A0N,20,20^FDSIZE^FS`,
    `^FO${left + 56},${dots(21.5) - 16}^A0N,44,44^FD${esc(cut(item.size_label ?? "—", 10))}^FS`,
    `^FO${left},${dots(26.8)}^GB${priceW},${dots(8)},3,B,2^FS`,
    `^FO${left + 16},${dots(26.8) + 16}^A0N,46,46^FD${esc(price)}^FS`,
    `^FO${left},${dots(46.4)}^A0N,20,20^FD${esc(item.sku)}^FS`,
    opts.copies && opts.copies > 1 ? `^PQ${opts.copies}` : "",
    "^XZ",
  ].filter(Boolean).join("\n");
}
