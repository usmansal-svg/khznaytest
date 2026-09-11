"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Banknote, CreditCard, Globe, Printer, ScanLine, Smartphone, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptPaper, type ReceiptData } from "@/components/pos/receipt";
import { pkr, usePos } from "@/components/pos/pos-context";
import { STAGE_LABELS, soldStageOf, type PosItem } from "@/lib/pos/pricing";
import { cn } from "@/lib/utils";

/**
 * The till. Scan a tag, the server prices it for today (list price walked
 * down the ladder by months on the floor), the cashier can override with a
 * reason, take payment, print. Every sale is atomic in the database and any
 * garment that is also listed online is taken off Shopify straight away.
 */

type Line = PosItem & { sold_price: number; override_reason: string; warnings: string[] };
type Method = "cash" | "card" | "jazzcash" | "easypaisa" | "bank_transfer";
const METHODS: { code: Method; label: string; icon: typeof Banknote }[] = [
  { code: "cash", label: "Cash", icon: Banknote }, { code: "card", label: "Card", icon: CreditCard },
  { code: "jazzcash", label: "JazzCash", icon: Smartphone }, { code: "easypaisa", label: "Easypaisa", icon: Smartphone }, { code: "bank_transfer", label: "Bank", icon: CreditCard },
];
const QUICK_CASH = [500, 1000, 2000, 5000];

export function Till() {
  const { me, api, reload } = usePos();
  const [sku, setSku] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<Method>("cash");
  const [tendered, setTendered] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<(ReceiptData & { shopify?: { done: number; failed: number } }) | null>(null);
  const [allowOther, setAllowOther] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const subtotal = lines.reduce((s, l) => s + l.sold_price, 0);
  const total = Math.max(0, subtotal - discount);
  const tenderedNum = Number(tendered) || 0;
  const change = method === "cash" ? tenderedNum - total : 0;
  const needsReason = lines.some((l) => l.sold_price !== l.price && !l.override_reason.trim());
  const canPay = lines.length > 0 && !busy && !needsReason && (method !== "cash" || tenderedNum >= total) && Boolean(me?.session);

  useEffect(() => { if (!receipt) scanRef.current?.focus(); }, [receipt, lines.length]);

  async function add(raw: string) {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    setSku("");
    if (lines.some((l) => l.sku === code)) { setMessage(`${code} is already in this sale.`); return; }
    setBusy(true); setMessage(null);
    try {
      const res = await api(`/api/pos/item?sku=${encodeURIComponent(code)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Lookup failed.");
      const item = j.item as PosItem;
      setLines((ls) => [...ls, { ...item, sold_price: item.price, override_reason: "", warnings: j.warnings ?? [] }]);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Lookup failed."); } finally { setBusy(false); }
  }

  async function pay() {
    if (!canPay) return;
    setBusy(true); setMessage(null);
    try {
      const res = await api("/api/pos/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        lines: lines.map((l) => ({ item_id: l.id, sold_price: l.sold_price, sold_stage: soldStageOf(l.stage), shelf_price: l.price, override_reason: l.override_reason.trim() || null })),
        payment_method: method, discount, tendered: method === "cash" ? tenderedNum : null, payment_ref: paymentRef || null, customer_phone: phone || null, allow_other_outlet: allowOther,
      }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Sale failed.");
      setReceipt({
        receipt_no: j.sale.receipt_no, sold_at: new Date().toISOString(), outlet: me?.outlet.name ?? null, cashier: me?.staff.name ?? null,
        lines: lines.map((l) => ({ sku: l.sku, brand: l.brand, sub_category: l.sub_category, sold_price: l.sold_price, sold_stage: soldStageOf(l.stage) })),
        subtotal, discount, total: j.sale.total, payment_method: method, tendered: method === "cash" ? tenderedNum : null, change_due: method === "cash" ? j.sale.change_due : null, shopify: j.shopify,
      });
      setLines([]); setDiscount(0); setTendered(""); setPaymentRef(""); setPhone(""); setAllowOther(false);
      void reload();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Sale failed."); } finally { setBusy(false); }
  }

  if (receipt) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        {receipt.shopify && receipt.shopify.failed > 0 && <p className="rounded-md border border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-950/40"><AlertTriangle className="mr-1 inline size-4" /> A garment on this receipt is listed online and could not be taken off Shopify just now. It is queued and will retry automatically.</p>}
        <div className="flex gap-2 print:hidden">
          <Button className="h-12 flex-1" onClick={() => window.print()}><Printer /> Print receipt</Button>
          <Button variant="outline" className="h-12 flex-1" onClick={() => setReceipt(null)} autoFocus>Next customer</Button>
        </div>
        <ReceiptPaper r={receipt} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {!me?.session && <p className="rounded-md border border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-950/40">The till is closed. Open it under <strong>Till session</strong> with the opening float before selling.</p>}
        <form onSubmit={(e) => { e.preventDefault(); void add(sku); }} className="relative">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input ref={scanRef} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Scan a tag or type the SKU" className="h-14 pl-10 font-mono text-lg" autoComplete="off" autoCapitalize="characters" disabled={busy} />
        </form>
        {message && <p className="rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{message}</p>}

        <Card>
          <CardContent className="p-0">
            {lines.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">Scan the first garment.</p>
            ) : (
              <ul className="divide-y">
                {lines.map((l) => (
                  <li key={l.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{l.brand} · {l.sub_category}{l.size_label ? ` · ${l.size_label}` : ""}</div>
                        <div className="text-xs text-muted-foreground"><span className="font-mono">{l.sku}</span> · {STAGE_LABELS[l.stage]}{l.stage !== "full" ? ` · list ${pkr(l.list_price)}` : ""}{l.days_on_floor != null ? ` · ${l.days_on_floor} days on floor` : ""}{l.is_rare ? " · ★ rare find" : ""}</div>
                        {l.online_listed && <div className="mt-0.5 text-xs text-sky-700 dark:text-sky-300"><Globe className="mr-1 inline size-3" />Also listed online — it will be taken off Shopify when this sale goes through.</div>}
                        {l.warnings.map((w) => <div key={w} className="mt-0.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mr-1 inline size-3" />{w}</div>)}
                      </div>
                      <div className="text-right">
                        <Input type="number" inputMode="numeric" value={l.sold_price} onChange={(e) => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, sold_price: Math.max(0, Math.round(Number(e.target.value) || 0)) } : x)))} className={cn("h-10 w-28 text-right text-base font-semibold tabular-nums", l.sold_price !== l.price && "border-amber-500")} />
                        {l.sold_price !== l.price && <div className="text-[11px] text-muted-foreground">shelf {pkr(l.price)}</div>}
                      </div>
                      <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="rounded p-2 text-muted-foreground hover:bg-muted" aria-label="Remove"><Trash2 className="size-4" /></button>
                    </div>
                    {l.sold_price !== l.price && (
                      <Input value={l.override_reason} onChange={(e) => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, override_reason: e.target.value } : x)))} placeholder="Why a different price? · required, recorded" className="mt-2 h-9 border-amber-500 text-sm" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {lines.some((l) => l.warnings.length) && me?.can_manage && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowOther} onChange={(e) => setAllowOther(e.target.checked)} /> Sell anyway (manager override — stock not received at this outlet)</label>
        )}
      </div>

      <Card className="lg:sticky lg:top-28 lg:self-start">
        <CardHeader className="pb-2"><CardTitle className="text-base">Payment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal · {lines.length} item{lines.length === 1 ? "" : "s"}</span><span className="tabular-nums">{pkr(subtotal)}</span></div>
            <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Discount</span><Input type="number" inputMode="numeric" min={0} value={discount || ""} onChange={(e) => setDiscount(Math.max(0, Math.round(Number(e.target.value) || 0)))} className="h-8 w-24 text-right" placeholder="0" /></div>
            <div className="flex justify-between border-t pt-2 text-2xl font-bold"><span>Total</span><span className="tabular-nums">{pkr(total)}</span></div>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {METHODS.map((m) => <Button key={m.code} type="button" variant={method === m.code ? "default" : "outline"} className="h-12 flex-col gap-0 px-0 text-[11px]" onClick={() => setMethod(m.code)}><m.icon className="size-4" />{m.label}</Button>)}
          </div>
          {method === "cash" ? (
            <div className="space-y-2">
              <Label>Cash tendered</Label>
              <Input type="number" inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value)} className="h-12 text-right text-xl font-semibold tabular-nums" placeholder={String(total)} />
              <div className="grid grid-cols-5 gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setTendered(String(total))}>Exact</Button>
                {QUICK_CASH.map((q) => <Button key={q} type="button" variant="outline" size="sm" onClick={() => setTendered(String(q))}>{q}</Button>)}
              </div>
              {tenderedNum >= total && total > 0 && <div className="flex justify-between text-lg"><span>Change</span><span className="font-bold tabular-nums">{pkr(change)}</span></div>}
            </div>
          ) : (
            <div className="space-y-1"><Label>Reference / last 4 digits</Label><Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className="h-10" placeholder="optional" /></div>
          )}
          <div className="space-y-1"><Label>Customer phone <span className="font-normal text-muted-foreground">· optional, for exchanges</span></Label><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" placeholder="03xx xxxxxxx" /></div>
          {needsReason && <p className="text-xs text-amber-700 dark:text-amber-300">A changed price needs its reason before paying.</p>}
          <Button type="button" className="h-14 w-full text-lg" disabled={!canPay} onClick={pay}>{busy ? "Recording…" : `Take ${pkr(total)}`}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
