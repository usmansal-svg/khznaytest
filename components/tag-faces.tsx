"use client";

/**
 * The two faces of a 50 × 90 mm hang tag — spec section 6. Shared by the
 * single-tag print page and the batch print page.
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
  const measured = item.measure_fields.map((f) => ({ f, v: item.measurements?.[f] })).filter(({ v }) => v !== undefined && v !== "" && v !== null);
  return (
    <>
      <div className="tag shadow-lg">
        <div className="absolute left-1/2 top-[3mm] size-[3.5mm] -translate-x-1/2 rounded-full border border-neutral-400" />
        <div className="absolute right-[3mm] top-[3mm] size-[10mm] border border-dashed border-neutral-400" title="colour sticker zone" />
        <div className="px-[4mm] pt-[9mm]">
          <div className="text-[13pt] font-black tracking-tight">Khazanay</div>
          <div className="mt-[3mm] truncate text-[9pt] font-semibold">{item.brand}</div>
          <div className="truncate text-[7.5pt] text-neutral-700">{item.sub_category}</div>
          <div className="mt-[3mm] text-[6pt] uppercase tracking-wide text-neutral-500">Size on label</div>
          <div className="text-[22pt] font-black leading-none">{item.size_label ?? "—"}</div>
          {measured.length > 0 && (
            <>
              <div className="mt-[2.5mm] text-[6pt] uppercase tracking-wide text-neutral-500">Measured flat (in)</div>
              <div className="text-[7pt] leading-tight">{measured.slice(0, 3).map(({ f, v }) => <div key={f} className="flex justify-between"><span>{f}</span><span className="tabular-nums">{v}</span></div>)}</div>
            </>
          )}
          <div className="absolute bottom-[4mm] left-[4mm] right-[4mm]">
            {item.status === "set_aside" && !item.list_price ? (
              <div className="rounded-sm border-2 border-black p-[1.5mm] text-center">
                <div className="text-[9pt] font-black uppercase tracking-wide">Rare find</div>
                <div className="text-[6pt] text-neutral-700">Set aside · to be priced by a senior</div>
              </div>
            ) : (<>
            {item.compare ? <div className="text-[6.5pt] text-neutral-500">New in store <span className="line-through">~{rs(item.compare.new_price)}</span></div> : null}
            <div className="flex items-end justify-between">
              <div><div className="text-[6pt] uppercase tracking-wide text-neutral-500">Our price</div><div className="text-[18pt] font-black leading-none tabular-nums">{rs(item.list_price)}</div></div>
              {item.compare && item.compare.saving_pct >= 10 ? <div className="mb-[0.5mm] rounded-sm border border-black px-[1.2mm] py-[0.4mm] text-center leading-tight"><div className="text-[5pt] uppercase tracking-wide">You save</div><div className="text-[10pt] font-black">{item.compare.saving_pct}%</div></div> : null}
            </div>
            <div className="mt-[1.5mm] h-[10mm] w-[42mm] border border-dashed border-neutral-400" title="discount sticker zone" />
            <div className="mt-[1mm] text-[5.5pt] text-neutral-500">Price includes sales tax</div>
            </>)}
          </div>
        </div>
      </div>
      <div className="tag shadow-lg">
        <div className="absolute left-1/2 top-[3mm] size-[3.5mm] -translate-x-1/2 rounded-full border border-neutral-400" />
        <div className="flex h-full flex-col px-[4mm] pt-[10mm]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/tags/${encodeURIComponent(item.sku)}/barcode`} alt={item.sku} className="w-full" style={{ height: "18mm", objectFit: "contain" }} />
          <div className="mt-[1mm] text-center font-mono text-[8pt] font-semibold tracking-wide">{item.sku}</div>
          <dl className="mt-[4mm] space-y-[1mm] text-[7pt]">
            <Row k="Outlet" v={item.outlet ?? "—"} /><Row k="Category" v={item.category} /><Row k="Item" v={item.sub_category} />
          </dl>
          <p className="mt-auto pb-[4mm] text-[6pt] leading-snug text-neutral-600">Condition grade and full details at <span className="font-semibold">khazanay.pk</span> — search the SKU.</p>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><dt className="text-neutral-500">{k}</dt><dd className="truncate text-right font-medium">{v}</dd></div>;
}
