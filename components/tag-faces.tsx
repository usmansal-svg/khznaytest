"use client";

import { widthModules } from "@/lib/barcode/code128";
import { DOT_MM, PRINT_OFFSET_MM } from "@/lib/tag-formats";

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

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

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
 * The 2 × 1 in (50.8 × 25.4 mm) label. Brand and size, garment type and
 * price, then a one-dot-per-module Code 128 (the widest that fits a
 * 16-character SKU on this label, crisp because its width is whole printer
 * dots) beside a 10 mm QR code that phone cameras read easily. The SKU is
 * printed once, under the bars. Nothing under 5.5 pt at 203 dpi.
 */
function TagLabelSmall({ item }: { item: TagItem }) {
  const rare = Boolean(item.is_rare);
  const left = PRINT_OFFSET_MM + 1.5;
  const barW = widthModules(item.sku, 6) * DOT_MM; // ≈ 28 mm
  const qr = 84 * DOT_MM; // 21 modules × 4 dots ≈ 10.5 mm
  return (
    <div className="tag shadow-lg">
      <div style={{ paddingLeft: `${left}mm`, paddingRight: "1.5mm", paddingTop: "1.2mm" }}>
        <div className="flex items-baseline justify-between gap-[2mm]">
          <div className="truncate text-[8pt] font-black leading-tight">{rare ? "★ " : ""}{item.brand || "Unbranded"}</div>
          <div className="shrink-0 text-[8pt] font-black leading-tight">{item.size_label ?? "—"}</div>
        </div>
        <div className="flex items-baseline justify-between gap-[2mm]">
          <div className="truncate text-[5.5pt] leading-tight text-neutral-700">{item.sub_category}</div>
          <div className="shrink-0 text-[11pt] font-black leading-none tabular-nums">{rs(item.list_price)}</div>
        </div>
      </div>
      <div className="absolute" style={{ left: `${left}mm`, bottom: "3.4mm", width: `${barW}mm`, height: "9mm" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/tags/${encodeURIComponent(item.sku)}/barcode?bare=1`} alt={item.sku} className="block" style={{ width: `${barW}mm`, height: "9mm" }} />
        <div className="text-center font-mono text-[5.5pt] font-semibold leading-tight tracking-wide">{item.sku}</div>
      </div>
      <div className="absolute" style={{ left: `${left + barW + 3}mm`, bottom: "1.5mm", width: `${qr}mm`, height: `${qr}mm` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/tags/${encodeURIComponent(item.sku)}/qr`} alt="" className="block" style={{ width: `${qr}mm`, height: `${qr}mm` }} />
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
