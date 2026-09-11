"use client";

import { METHOD_LABELS, pkr } from "@/components/pos/pos-context";
import { STAGE_LABELS } from "@/lib/pos/pricing";

export type ReceiptLine = { sku: string; brand: string; sub_category: string; sold_price: number; sold_stage: string; returned_at?: string | null };
export type ReceiptData = { receipt_no: string; sold_at: string; outlet: string | null; cashier: string | null; lines: ReceiptLine[]; subtotal: number; discount: number; total: number; payment_method: string; tendered: number | null; change_due: number | null; voided_at?: string | null };

/** The 80 mm receipt. `#receipt` is the only thing that prints. */
export function ReceiptPaper({ r }: { r: ReceiptData }) {
  return (
    <>
      <div id="receipt" className="rounded-lg border bg-white p-5 font-mono text-sm text-black">
        <div className="text-center">
          <div className="text-lg font-bold">KHAZANAY</div>
          <div className="text-xs">{r.outlet ?? "Outlet"} · Thrift</div>
          <div className="mt-2 text-xs">{r.receipt_no}</div>
          <div className="text-xs">{new Date(r.sold_at).toLocaleString("en-PK")}{r.cashier ? ` · ${r.cashier}` : ""}</div>
          {r.voided_at && <div className="mt-1 text-sm font-bold">*** VOIDED ***</div>}
        </div>
        <hr className="my-3 border-dashed border-black" />
        {r.lines.map((l, i) => (
          <div key={i} className={`mb-1 flex justify-between gap-2 ${l.returned_at ? "line-through opacity-60" : ""}`}>
            <div className="min-w-0"><div className="truncate">{l.brand} {l.sub_category}</div><div className="text-xs">{l.sku}{l.sold_stage !== "full" ? ` · ${STAGE_LABELS[l.sold_stage as keyof typeof STAGE_LABELS] ?? l.sold_stage}` : ""}</div></div>
            <div className="tabular-nums">{pkr(l.sold_price)}</div>
          </div>
        ))}
        <hr className="my-3 border-dashed border-black" />
        <div className="space-y-0.5">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{pkr(r.subtotal)}</span></div>
          {r.discount > 0 && <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">-{pkr(r.discount)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>TOTAL</span><span className="tabular-nums">{pkr(r.total)}</span></div>
          <div className="flex justify-between"><span>{METHOD_LABELS[r.payment_method] ?? r.payment_method}</span><span className="tabular-nums">{pkr(r.tendered ?? r.total)}</span></div>
          {r.change_due != null && <div className="flex justify-between"><span>Change</span><span className="tabular-nums">{pkr(r.change_due)}</span></div>}
        </div>
        <hr className="my-3 border-dashed border-black" />
        <p className="text-center text-xs">Prices include sales tax. Exchange within 7 days with this receipt.</p>
        <p className="mt-1 text-center text-xs">Shukriya!</p>
      </div>
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #receipt, #receipt * { visibility: visible; }
          #receipt { position: absolute; left: 0; top: 0; width: 80mm; border: 0; padding: 4mm; }
          @page { size: 80mm auto; margin: 0; }
        }
      `}</style>
    </>
  );
}
