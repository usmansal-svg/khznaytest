"use client";

import { useEffect, useState } from "react";

type Line = { sku: string; brand: string; sub_category: string; grade: string; size_label: string | null; list_price: number | null; qc?: boolean };
type Transfer = { id: number; code: string; to_outlet: string; status: string; created_at: string; note: string | null; items: Line[] };

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/** A4 packing list with a barcode per line so the outlet can scan-check arrivals. */
export function TransferSheet({ id }: { id: number }) {
  const [t, setT] = useState<Transfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/transfers").then((r) => r.json()).then((j) => {
      const found = (j.transfers as Transfer[] | undefined)?.find((x) => x.id === id);
      if (found) setT(found); else setError("Transfer not found.");
    });
  }, [id]);
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!t) return <p className="p-6 text-neutral-500">Loading…</p>;
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { .no-print { display: none } }`}</style>
      <div className="no-print mb-4 flex gap-3 text-sm"><button onClick={() => window.print()} className="rounded-md bg-black px-4 py-2 font-semibold text-white">Print</button><a href="/transfers" className="self-center underline">Back</a></div>
      <div className="flex items-start justify-between border-b pb-4">
        <div><div className="text-2xl font-black">Khazanay · Transfer</div><div className="font-mono text-lg">{t.code}</div></div>
        <div className="text-right text-sm"><div className="text-xl font-bold">→ {t.to_outlet}</div><div>{new Date(t.created_at).toLocaleDateString("en-PK")}</div>{t.note && <div className="text-neutral-600">{t.note}</div>}</div>
      </div>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs uppercase text-neutral-500"><tr><th className="py-1">#</th><th className="py-1">SKU</th><th className="py-1">Garment</th><th className="py-1">Size</th><th className="py-1 text-right">Price</th><th className="py-1 text-center">✓</th></tr></thead>
        <tbody className="divide-y">
          {t.items.map((l, i) => (
            <tr key={l.sku}>
              <td className="py-1.5 text-neutral-500">{i + 1}</td>
              <td className="py-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/tags/${encodeURIComponent(l.sku)}/barcode`} alt={l.sku} className="h-8" />
              </td>
              <td className="py-1.5">{l.brand || "Unbranded"} · {l.sub_category}</td>
              <td className="py-1.5">{l.size_label ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{l.list_price != null ? rs(l.list_price) : "—"}</td>
              <td className="py-1.5 text-center"><span className="inline-block size-4 border" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-between border-t pt-3 text-sm"><span>{t.items.length} garments</span><span className="font-semibold">{rs(t.items.reduce((s, l) => s + (l.list_price ?? 0), 0))} at list price</span></div>
      <div className="mt-10 grid grid-cols-2 gap-8 text-sm"><div className="border-t pt-2">Packed by</div><div className="border-t pt-2">Received by · date</div></div>
    </div>
  );
}
