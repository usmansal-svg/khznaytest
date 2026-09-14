"use client";

import { DOT_MM, PRINT_OFFSET_MM } from "@/lib/tag-formats";
import { cn } from "@/lib/utils";

/**
 * The 50 × 90 mm hang tag — single-sided, one page per garment.
 *
 * Top to bottom: wordmark (with unmarked space top-right for the month's
 * colour sticker), brand, size, the price large, unmarked space for the
 * markdown sticker, then barcode and SKU.
 * Nothing about condition, cost or outlet: the customer is holding the
 * garment and the SKU carries the rest.
 */

export type TagItem = {
  sku: string;
  brand: string;
  category: string;
  sub_category: string;
  size_label: string | null;
  measurements: Record<string, number | string>;
  measure_fields: string[];
  list_price: number;
  status?: string;
  is_rare?: boolean;
  rare_note?: string | null;
  rare_tag_line?: string | null;
  outlet: string | null;
  market_price?: number | null;
  compare?: { new_price: number; saving_pct: number; source: string; confirmed: boolean } | null;
};

// Written the Pakistani way on every tag: Rs. 1,990/-
const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-PK")}/-`;

/**
 * Which paper the station has loaded. Thermal labels come in three sizes
 * (2 × 1 in for now, 2.5 × 1.5 in, 3 × 2 in once the bigger rolls arrive)
 * plus the 50 × 90 mm hang tag. Remembered per device.
 */
export { TAG_FORMATS, type TagFormat } from "@/lib/tag-formats";
import { TAG_FORMATS, isTagFormat, type TagFormat } from "@/lib/tag-formats";
export function readTagFormat(): TagFormat {
  try { const v = localStorage.getItem("khz_tag_format"); if (isTagFormat(v)) return v; } catch { /* fine */ }
  return "label2x1";
}
export function saveTagFormat(f: TagFormat) { try { localStorage.setItem("khz_tag_format", f); } catch { /* fine */ } }

export function tagCss(format: TagFormat = "hang") {
  const f = TAG_FORMATS.find((x) => x.code === format) ?? TAG_FORMATS[3];
  return `
    @page { size: ${f.w}mm ${f.h}mm; margin: 0; }
    @media print {
      .no-print { display: none !important; }
      .tag { box-shadow: none !important; margin: 0 !important; page-break-after: always; break-after: page; }
      body { background: #fff; }
    }
    .tag { width: ${f.w}mm; height: ${f.h}mm; background: #fff; color: #000; position: relative; overflow: hidden; font-family: ui-sans-serif, system-ui, sans-serif; }
  `;
}

export function TagFaces({ item, format = "hang" }: { item: TagItem; format?: TagFormat }) {
  const rare = Boolean(item.is_rare);
  if (format === "label2x1") return <TagLabelSmall item={item} />;
  if (format === "label225x15") return <TagLabelMedium item={item} />;
  if (format === "label15x225") return <TagLabelPortrait item={item} />;
  if (format === "label50x50") return <TagLabelSquare item={item} />;
  if (format === "label") return <TagLabel item={item} />;
  if (format === "label3x2") return <TagLabelLarge item={item} />;
  return (
    <div className="tag shadow-lg">
      {/* hole */}
      <div className="absolute left-1/2 top-[3mm] size-[3.5mm] -translate-x-1/2 rounded-full border border-neutral-400" />
      {/* colour-dot zone: the month's floor colour sticker */}
      {/* reserved, unmarked: the month's colour sticker goes here */}
      <div className="absolute right-[3mm] top-[7mm] size-[10mm]" aria-hidden />

      <div className="px-[4mm] pt-[8mm]">
        <div className="text-[11pt] font-black tracking-tight">Khazanay</div>

        <div className="mt-[4mm] truncate text-[10pt] font-bold leading-tight">{item.brand}</div>
        <div className="truncate text-[7pt] text-neutral-600">{item.sub_category}</div>

        <div className="mt-[3mm] flex items-end gap-[3mm]">
          <div>
            <div className="text-[5.5pt] uppercase tracking-wide text-neutral-500">Size</div>
            <div className="text-[20pt] font-black leading-none">{item.size_label ?? "—"}</div>
          </div>
        </div>

        {rare && (
          <div className="mt-[2mm] rounded-sm border-2 border-black px-[1.5mm] py-[1mm]">
            <div className="text-[8pt] font-black uppercase tracking-wide">★ Rare find</div>
            {(item.rare_tag_line || item.rare_note) && <div className="line-clamp-2 text-[5.5pt] leading-tight text-neutral-800">{item.rare_tag_line || item.rare_note}</div>}
          </div>
        )}
        <div className={rare ? "mt-[2mm]" : "mt-[4mm]"}>
          <div className="text-[5.5pt] uppercase tracking-wide text-neutral-500">Price</div>
          <div className="text-[24pt] font-black leading-none tabular-nums">{rs(item.list_price)}</div>
          {/* reserved, unmarked: the markdown sticker goes here */}
          <div className={rare ? "mt-[1mm] h-[8mm] w-[42mm]" : "mt-[2mm] h-[10mm] w-[42mm]"} aria-hidden />
        </div>
      </div>

      {/* barcode + SKU */}
      <div className="absolute bottom-[3mm] left-[4mm] right-[4mm]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/tags/${encodeURIComponent(item.sku)}/barcode`} alt={item.sku} className="w-full" style={{ height: "13mm", objectFit: "contain" }} />
        <div className="text-center font-mono text-[7.5pt] font-semibold tracking-wide">{item.sku}</div>
      </div>
    </div>
  );
}

/**
 * The 2.5 × 1.5 in (63.5 × 38.1 mm) thermal label, landscape. Everything the
 * hang tag carries except the markdown-sticker space, which does not fit:
 * brand, garment type, size, price, a blank corner for the colour sticker,
 * barcode and SKU. Thermal heads print at 203 dpi, so nothing under 5.5 pt.
 */
function TagLabel({ item }: { item: TagItem }) {
  const rare = Boolean(item.is_rare);
  return (
    <div className="tag shadow-lg">
      {/* reserved, unmarked: the month's colour sticker goes in this corner */}
      <div className="absolute right-[2mm] top-[2mm] size-[8mm]" aria-hidden />
      <div className="px-[2.5mm] pt-[2mm]">
        <div className="flex items-baseline justify-between pr-[9mm]">
          <div className="truncate text-[9.5pt] font-black leading-tight">{item.brand || "Unbranded"}</div>
          <div className="shrink-0 text-[6pt] font-black tracking-tight">Khazanay</div>
        </div>
        <div className="truncate text-[6.5pt] leading-tight text-neutral-700">{rare ? `★ RARE FIND · ${item.rare_tag_line || item.sub_category}` : item.sub_category}</div>
        <div className="mt-[1.5mm] flex items-end justify-between">
          <div>
            <div className="text-[5.5pt] uppercase tracking-wide text-neutral-500">Size</div>
            <div className="text-[15pt] font-black leading-none">{item.size_label ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-[5.5pt] uppercase tracking-wide text-neutral-500">Price</div>
            <div className="text-[17pt] font-black leading-none tabular-nums">{rs(item.list_price)}</div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[1.5mm] left-[2.5mm] right-[2.5mm]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/tags/${encodeURIComponent(item.sku)}/barcode`} alt={item.sku} className="w-full" style={{ height: "8.5mm", objectFit: "contain" }} />
        <div className="text-center font-mono text-[6pt] font-semibold tracking-wide">{item.sku}</div>
      </div>
    </div>
  );
}

/**
 * The 2 × 1 in (50.8 × 25.4 mm) label: a 13 mm QR code (the SKU, 5 printer
 * dots per module, a 2.5 mm quiet zone all round) on the right,
 * and on the left the size and price large with the brand and garment type
 * small above them and the SKU in clear text below. No 1D barcode: the
 * Henex H1200 at the till is a 2D scanner (checked 14 Sep 2026).
 */
function TagLabelSmall({ item }: { item: TagItem }) {
  const rare = Boolean(item.is_rare);
  const left = PRINT_OFFSET_MM + 1.5;
  // 21 modules × 5 dots ≈ 13 mm, inside a white quiet zone of 4 modules
  // (2.5 mm) on every side: without it phone cameras hunt for the code.
  const mod = 5 * DOT_MM;
  const qr = 21 * mod;
  const quiet = 4 * mod;
  const box = qr + 2 * quiet;
  return (
    <div className="tag shadow-lg">
      <div className="absolute flex flex-col" style={{ left: `${left}mm`, top: "1.4mm", bottom: "1.2mm", width: `${50.8 - left - box + quiet / 2}mm` }}>
        <div className="truncate text-[6pt] font-bold leading-tight">{rare ? "★ " : ""}{item.brand || "Unbranded"}</div>
        <div className="truncate text-[5.5pt] leading-tight text-neutral-700">{item.sub_category}</div>
        <div className="mt-auto truncate text-[9.5pt] font-black leading-none"><span className="mr-[1mm] text-[5.5pt] font-bold uppercase tracking-wide text-neutral-600">Size</span>{item.size_label ?? "—"}</div>
        <div className="mt-[0.8mm] inline-block self-start whitespace-nowrap rounded-[0.8mm] border-[0.35mm] border-black px-[1mm] py-[0.6mm] text-[11pt] font-black leading-none tabular-nums tracking-tight">{rs(item.list_price)}</div>
        <div className="mt-[1mm] font-mono text-[5.5pt] font-semibold leading-none tracking-wide">{item.sku}</div>
      </div>
      <div className="absolute bg-white" style={{ right: 0, top: `${(25.4 - box) / 2}mm`, width: `${box}mm`, height: `${box}mm`, padding: `${quiet}mm` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/tags/${encodeURIComponent(item.sku)}/qr`} alt={item.sku} className="block" style={{ width: `${qr}mm`, height: `${qr}mm` }} />
      </div>
    </div>
  );
}

/**
 * The 3 × 2 in (76.2 × 50.8 mm) label: the 2.5 × 1.5 layout with more air —
 * bigger price and size, a taller barcode, and the colour-sticker corner.
 */
function TagLabelLarge({ item }: { item: TagItem }) {
  const rare = Boolean(item.is_rare);
  return (
    <div className="tag shadow-lg">
      {/* reserved, unmarked: the month's colour sticker goes in this corner */}
      <div className="absolute right-[2.5mm] top-[2.5mm] size-[10mm]" aria-hidden />
      <div className="px-[3mm] pt-[2.5mm]">
        <div className="flex items-baseline justify-between pr-[11mm]">
          <div className="truncate text-[12pt] font-black leading-tight">{item.brand || "Unbranded"}</div>
          <div className="shrink-0 text-[7pt] font-black tracking-tight">Khazanay</div>
        </div>
        <div className="truncate text-[8pt] leading-tight text-neutral-700">{rare ? `★ RARE FIND · ${item.rare_tag_line || item.sub_category}` : item.sub_category}</div>
        <div className="mt-[2.5mm] flex items-end justify-between">
          <div>
            <div className="text-[6pt] uppercase tracking-wide text-neutral-500">Size</div>
            <div className="text-[20pt] font-black leading-none">{item.size_label ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-[6pt] uppercase tracking-wide text-neutral-500">Price</div>
            <div className="text-[22pt] font-black leading-none tabular-nums">{rs(item.list_price)}</div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[2mm] left-[3mm] right-[3mm]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/tags/${encodeURIComponent(item.sku)}/barcode`} alt={item.sku} className="w-full" style={{ height: "12mm", objectFit: "contain" }} />
        <div className="text-center font-mono text-[7pt] font-semibold tracking-wide">{item.sku}</div>
      </div>
    </div>
  );
}

/**
 * The 2.25 × 1.5 in (57.15 × 38.1 mm) label for the Zebra ZD220t: the same
 * arrangement as the 2 × 1 label with more air — a 19 mm QR code (6 dots
 * per module, 3 mm quiet zone), the price in its box at 15 pt, the size
 * above it, brand and garment type at the top, the SKU in clear text.
 * No print offset: the Zebra's origin sits on the label edge.
 */
function TagLabelMedium({ item }: { item: TagItem }) {
  const rare = Boolean(item.is_rare);
  const W = 57.15, H = 38.1;
  const mod = 5 * DOT_MM;
  const qr = 21 * mod; // ≈ 13 mm
  const quiet = 4 * mod;
  const box = qr + 2 * quiet; // ≈ 18 mm
  const bandH = 4.6;
  return (
    <div className="tag shadow-lg">
      {/* Header: the wordmark reversed out of a black band; a Rare find says so on the right of it */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-black px-[2.2mm] text-[6.5pt] font-black uppercase leading-none tracking-[0.2em] text-white" style={{ height: `${bandH}mm` }}>
        <span>Khazanay</span>
        {rare && <span className="tracking-[0.1em]">★ Rare find</span>}
      </div>
      <div className="absolute flex flex-col" style={{ left: "2.2mm", top: `${bandH + 1.4}mm`, bottom: "1.6mm", width: `${W - 2.2 - box + quiet / 2}mm` }}>
        <div className="truncate text-[8.5pt] font-black leading-tight tracking-tight">{item.brand || "Unbranded"}</div>
        <div className="truncate text-[6.5pt] leading-tight text-neutral-600">{rare && item.rare_tag_line ? item.rare_tag_line : item.sub_category}</div>
        <div className="mt-auto flex items-baseline gap-[1.2mm] leading-none">
          <span className="text-[5.5pt] font-bold uppercase tracking-[0.14em] text-neutral-500">Size</span>
          <span className="text-[11pt] font-black tracking-tight">{item.size_label ?? "—"}</span>
        </div>
        <div className="mt-[1.1mm] inline-block self-start whitespace-nowrap rounded-[1mm] border-[0.45mm] border-black px-[1.6mm] py-[0.8mm] text-[13pt] font-black leading-none tabular-nums tracking-tight">{rs(item.list_price)}</div>
        <div className="mt-[1.2mm] font-mono text-[5.5pt] font-semibold leading-none tracking-[0.08em] text-neutral-700">{item.sku}</div>
      </div>
      {/* QR top right, under the band */}
      <div className="absolute bg-white" style={{ right: 0, top: `${bandH + 0.4}mm`, width: `${box}mm`, height: `${box}mm`, padding: `${quiet}mm` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/tags/${encodeURIComponent(item.sku)}/qr`} alt={item.sku} className="block" style={{ width: `${qr}mm`, height: `${qr}mm` }} />
      </div>
      {/* reserved, unmarked: the markdown sticker (up to 15 mm) goes here, bottom right */}
      <div className="markdown-zone absolute" aria-hidden style={{ right: "1.6mm", bottom: "1.6mm", width: "15mm", height: `${H - bandH - 0.4 - box - 1.6 - 0.8}mm` }} />
    </div>
  );
}

/**
 * The same sticker turned upright: 1.5 × 2.25 in (38.1 × 57.15 mm). Wordmark
 * on top, brand and type, a 19 mm QR code in the middle, then size, the
 * price in its box and the SKU. Rare find: the black band above the brand.
 */
function TagLabelPortrait({ item }: { item: TagItem }) {
  const rare = Boolean(item.is_rare);
  const mod = 5 * DOT_MM;
  const qr = 21 * mod; // ≈ 13 mm
  const quiet = 2 * mod;
  const box = qr + 2 * quiet; // ≈ 15.7 mm
  const left = 2, W = 38.1;
  const textW = W - left - box - 0.3; // beside the QR
  // Fixed rows in mm. The bottom-right corner (from 37 mm down, 17 mm wide) stays empty for the round markdown sticker.
  const rows = { mark: 1.8, brand: 5.2, type: 9.6, size: 19.2, price: 24.4, sku: 53.6 };
  return (
    <div className="tag shadow-lg">
      <div className="absolute truncate text-[6.5pt] font-black uppercase leading-none tracking-[0.18em]" style={{ left: `${left}mm`, top: `${rows.mark}mm`, width: `${textW}mm` }}>Khazanay</div>
      <div className="absolute truncate text-[9pt] font-black leading-none tracking-tight" style={{ left: `${left}mm`, top: `${rows.brand}mm`, width: `${textW}mm` }}>{item.brand || "Unbranded"}</div>
      {rare
        ? <div className="absolute text-[6pt] leading-[1.15] text-neutral-700" style={{ left: `${left}mm`, top: `${rows.type}mm`, width: `${textW}mm`, maxHeight: "6.4mm", overflow: "hidden" }}><span className="text-[5.5pt] font-black uppercase tracking-wide text-black">★ Rare find</span>{item.rare_tag_line ? ` · ${item.rare_tag_line}` : ""}</div>
        : <div className="absolute text-[6.5pt] leading-[1.15] text-neutral-600" style={{ left: `${left}mm`, top: `${rows.type}mm`, width: `${textW}mm`, maxHeight: "6.4mm", overflow: "hidden" }}>{item.sub_category}</div>}
      {/* QR top right, beside the wordmark, brand and type */}
      <div className="absolute bg-white" style={{ right: 0, top: "1mm", padding: `${quiet}mm` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/tags/${encodeURIComponent(item.sku)}/qr`} alt={item.sku} className="block" style={{ width: `${qr}mm`, height: `${qr}mm` }} />
      </div>
      <div className="absolute flex items-baseline gap-[1.2mm] leading-none" style={{ left: `${left}mm`, top: `${rows.size}mm` }}>
        <span className="text-[5.5pt] font-bold uppercase tracking-[0.14em] text-neutral-500">Size</span>
        <span className="text-[12pt] font-black tracking-tight">{item.size_label ?? "—"}</span>
      </div>
      <div className="absolute whitespace-nowrap rounded-[1mm] border-[0.45mm] border-black px-[2mm] py-[0.9mm] text-[13pt] font-black leading-none tabular-nums tracking-tight" style={{ left: `${left}mm`, top: `${rows.price}mm` }}>{rs(item.list_price)}</div>
      {/* 33–57 mm on the right: empty for the round markdown sticker */}
      <div className="absolute font-mono text-[5.5pt] font-semibold leading-none tracking-[0.08em] text-neutral-700" style={{ left: `${left}mm`, top: `${rows.sku}mm` }}>{item.sku}</div>
    </div>
  );
}

/**
 * The 5 × 5 cm square label: the portrait arrangement with more width —
 * wordmark, brand and type top left, the QR top right, size and the boxed
 * price on the left, the SKU bottom left, and the bottom-right corner
 * (about 18 mm square) empty for the round markdown sticker.
 */
function TagLabelSquare({ item }: { item: TagItem }) {
  const rare = Boolean(item.is_rare);
  const mod = 6 * DOT_MM;
  const qr = 21 * mod; // ≈ 15.8 mm
  const quiet = 2 * mod;
  const box = qr + 2 * quiet;
  const left = 3.5, W = 50;
  const textW = W - left - box - 0.3;
  const rows = { mark: 3, brand: 6.6, type: 11.2, size: 22.5, price: 27.8, sku: 45 };
  const typeLine = rare ? <><span className="text-[6pt] font-black uppercase tracking-wide text-black">★ Rare find</span>{item.rare_tag_line ? ` · ${item.rare_tag_line}` : ""}</> : item.sub_category;
  return (
    <div className="tag shadow-lg">
      <div className="absolute truncate text-[7pt] font-black uppercase leading-none tracking-[0.18em]" style={{ left: `${left}mm`, top: `${rows.mark}mm`, width: `${textW}mm` }}>Khazanay</div>
      <div className="absolute truncate text-[10pt] font-black leading-none tracking-tight" style={{ left: `${left}mm`, top: `${rows.brand}mm`, width: `${textW}mm` }}>{item.brand || "Unbranded"}</div>
      <div className="absolute text-[7pt] leading-[1.15] text-neutral-600" style={{ left: `${left}mm`, top: `${rows.type}mm`, width: `${textW}mm`, maxHeight: "7mm", overflow: "hidden" }}>{typeLine}</div>
      <div className="absolute bg-white" style={{ right: `${3.5 - quiet}mm`, top: `${3 - quiet}mm`, padding: `${quiet}mm` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/tags/${encodeURIComponent(item.sku)}/qr`} alt={item.sku} className="block" style={{ width: `${qr}mm`, height: `${qr}mm` }} />
      </div>
      <div className="absolute flex items-baseline gap-[1.2mm] leading-none" style={{ left: `${left}mm`, top: `${rows.size}mm` }}>
        <span className="text-[6pt] font-bold uppercase tracking-[0.14em] text-neutral-500">Size</span>
        <span className="text-[13pt] font-black tracking-tight">{item.size_label ?? "—"}</span>
      </div>
      <div className="absolute whitespace-nowrap rounded-[1mm] border-[0.45mm] border-black px-[2mm] py-[1mm] text-[14pt] font-black leading-none tabular-nums tracking-tight" style={{ left: `${left}mm`, top: `${rows.price}mm` }}>{rs(item.list_price)}</div>
      {/* bottom right, from about 30 mm down and 30 mm across: empty for the round markdown sticker */}
      <div className="absolute font-mono text-[6pt] font-semibold leading-none tracking-[0.08em] text-neutral-700" style={{ left: `${left}mm`, top: `${rows.sku}mm` }}>{item.sku}</div>
    </div>
  );
}
