"use client";

/**
 * The 50 × 90 mm hang tag — single-sided, one page per garment.
 *
 * Top to bottom: wordmark and the colour-dot zone (the month's floor
 * colour sticker goes there), brand, size, price with the comparable
 * price and saving, the markdown-sticker zone, then barcode and SKU.
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
  const held = item.status === "set_aside" && !item.list_price;
  return (
    <div className="tag shadow-lg">
      {/* hole */}
      <div className="absolute left-1/2 top-[3mm] size-[3.5mm] -translate-x-1/2 rounded-full border border-neutral-400" />
      {/* colour-dot zone: the month's floor colour sticker */}
      <div className="absolute right-[3mm] top-[7mm] flex size-[10mm] items-center justify-center rounded-full border border-dashed border-neutral-400" title="colour sticker zone">
        <span className="text-[4.5pt] text-neutral-400">colour</span>
      </div>

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

        {held ? (
          <div className="mt-[5mm] rounded-sm border-2 border-black p-[2mm] text-center">
            <div className="text-[10pt] font-black uppercase tracking-wide">Rare find</div>
            <div className="text-[6pt] text-neutral-700">Set aside · to be priced by a senior</div>
          </div>
        ) : (
          <div className="mt-[4mm]">
            {item.compare ? (
              <div className="text-[6.5pt] text-neutral-500">
                New in store <span className="line-through">~{rs(item.compare.new_price)}</span>
              </div>
            ) : null}
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[5.5pt] uppercase tracking-wide text-neutral-500">Our price</div>
                <div className="text-[19pt] font-black leading-none tabular-nums">{rs(item.list_price)}</div>
              </div>
              {item.compare && item.compare.saving_pct >= 10 ? (
                <div className="mb-[0.5mm] rounded-sm border border-black px-[1.4mm] py-[0.5mm] text-center leading-tight">
                  <div className="text-[5pt] uppercase tracking-wide">You save</div>
                  <div className="text-[11pt] font-black">{item.compare.saving_pct}%</div>
                </div>
              ) : null}
            </div>
            {/* markdown sticker zone */}
            <div className="mt-[2mm] flex h-[10mm] w-[42mm] items-center justify-center border border-dashed border-neutral-400" title="discount sticker zone">
              <span className="text-[4.5pt] text-neutral-400">markdown sticker</span>
            </div>
          </div>
        )}
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
