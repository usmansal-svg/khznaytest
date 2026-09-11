"use client";

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
  outlet: string | null;
  market_price?: number | null;
  compare?: { new_price: number; saving_pct: number; source: string; confirmed: boolean } | null;
};

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

export function tagCss() {
  return `
    @page { size: 50mm 90mm; margin: 0; }
    @media print {
      .no-print { display: none !important; }
      .tag { box-shadow: none !important; margin: 0 !important; page-break-after: always; break-after: page; }
      body { background: #fff; }
    }
    .tag { width: 50mm; height: 90mm; background: #fff; color: #000; position: relative; overflow: hidden; font-family: ui-sans-serif, system-ui, sans-serif; }
  `;
}

export function TagFaces({ item }: { item: TagItem }) {
  const rare = Boolean(item.is_rare);
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
            {item.rare_note && <div className="line-clamp-2 text-[5.5pt] leading-tight text-neutral-800">{item.rare_note}</div>}
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
