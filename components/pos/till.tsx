"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, CreditCard, Printer, ScanLine, Smartphone, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { STAGE_LABELS, type PosItem, type SaleStage } from "@/lib/pos/pricing";

type Line = PosItem & { sold_price: number };

type PaymentMethod = "cash" | "card" | "jazzcash" | "easypaisa" | "bank_transfer";

const METHODS: { code: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { code: "cash", label: "Cash", icon: Banknote },
  { code: "card", label: "Card", icon: CreditCard },
  { code: "jazzcash", label: "JazzCash", icon: Smartphone },
  { code: "easypaisa", label: "Easypaisa", icon: Smartphone },
  { code: "bank_transfer", label: "Bank", icon: CreditCard },
];

const QUICK_CASH = [500, 1000, 2000, 5000];

type Receipt = {
  receipt_no: string;
  sold_at: string;
  lines: Line[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  tendered: number | null;
  change_due: number | null;
};

const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

function stageLabel(stage: PosItem["stage"]) {
  return stage === "pull" ? "75% off (pull)" : STAGE_LABELS[stage];
}

export function Till() {
  const [sku, setSku] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const subtotal = lines.reduce((s, l) => s + l.sold_price, 0);
  const total = Math.max(0, subtotal - discount);
  const tenderedNum = Number(tendered) || 0;
  const change = method === "cash" ? tenderedNum - total : 0;
  const canPay = lines.length > 0 && !busy && (method !== "cash" || tenderedNum >= total);

  // Keep the scanner focused: barcode guns type the code and press Enter.
  useEffect(() => {
    if (!receipt) scanRef.current?.focus();
  }, [receipt, lines.length]);

  async function addSku(raw: string) {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    if (lines.some((l) => l.sku === code)) {
      setMessage(`${code} is already in the basket.`);
      setSku("");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/pos/item?sku=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "Lookup failed.");
        return;
      }
      const item: PosItem = json.item;
      setLines((prev) => [...prev, { ...item, sold_price: item.price }]);
      setMessage(null);
    } catch {
      setMessage("Could not reach the server.");
    } finally {
      setBusy(false);
      setSku("");
    }
  }

  function setLinePrice(id: number, value: string) {
    const n = Math.max(0, Math.round(Number(value) || 0));
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, sold_price: n } : l)));
  }

  function removeLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function clearBasket() {
    setLines([]);
    setDiscount(0);
    setTendered("");
    setPaymentRef("");
    setPhone("");
    setMessage(null);
  }

  async function checkout() {
    if (!canPay) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            item_id: l.id,
            sold_price: l.sold_price,
            sold_stage: (l.stage === "pull" ? "md3" : l.stage) satisfies SaleStage,
          })),
          payment_method: method,
          discount,
          tendered: method === "cash" ? tenderedNum : null,
          payment_ref: paymentRef,
          customer_phone: phone,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "Checkout failed.");
        return;
      }
      setReceipt({
        receipt_no: json.sale.receipt_no,
        sold_at: new Date().toISOString(),
        lines,
        subtotal,
        discount,
        total: json.sale.total,
        payment_method: method,
        tendered: method === "cash" ? tenderedNum : null,
        change_due: method === "cash" ? json.sale.change_due : null,
      });
      clearBasket();
    } catch {
      setMessage("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return <ReceiptView receipt={receipt} onDone={() => setReceipt(null)} />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* Basket */}
      <Card>
        <CardHeader className="pb-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addSku(sku);
            }}
          >
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={scanRef}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Scan or type SKU, then Enter"
                className="h-12 pl-10 font-mono text-lg uppercase"
                autoComplete="off"
                autoFocus
              />
            </div>
            <Button type="submit" size="lg" className="h-12" disabled={busy || !sku.trim()}>
              Add
            </Button>
          </form>
          {message && (
            <p role="status" className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {message}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="py-16 text-center text-muted-foreground">Basket is empty. Scan a tag to begin.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="pb-2">Item</th>
                    <th className="pb-2">Stage</th>
                    <th className="pb-2 text-right">List</th>
                    <th className="pb-2 text-right">Price</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 pr-2">
                        <div className="font-medium">
                          {l.brand} · {l.sub_category}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {l.sku}
                          {l.size_label ? ` · ${l.size_label}` : ""} · {l.grade.replace("_", " ")}
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={cn(
                            "whitespace-nowrap rounded-full px-2 py-0.5 text-xs",
                            l.stage === "full" ? "bg-muted" : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                          )}
                        >
                          {stageLabel(l.stage)}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
                        {l.list_price !== l.sold_price ? <s>{pkr(l.list_price)}</s> : pkr(l.list_price)}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          step={10}
                          value={l.sold_price}
                          onChange={(e) => setLinePrice(l.id, e.target.value)}
                          className="ml-auto h-8 w-24 text-right tabular-nums"
                          aria-label={`Price for ${l.sku}`}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="icon" onClick={() => removeLine(l.id)} aria-label={`Remove ${l.sku}`}>
                          <X />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment */}
      <Card className="lg:sticky lg:top-4 lg:self-start">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>
              {lines.length} {lines.length === 1 ? "item" : "items"}
            </span>
            {lines.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearBasket}>
                <Trash2 /> Clear
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{pkr(subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Discount</dt>
              <dd>
                <Input
                  type="number"
                  min={0}
                  max={subtotal}
                  step={10}
                  value={discount || ""}
                  placeholder="0"
                  onChange={(e) =>
                    setDiscount(Math.min(subtotal, Math.max(0, Math.round(Number(e.target.value) || 0))))
                  }
                  className="h-8 w-24 text-right tabular-nums"
                  aria-label="Basket discount"
                />
              </dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-xl font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{pkr(total)}</dd>
            </div>
          </dl>

          <div>
            <Label className="mb-2 block text-xs uppercase text-muted-foreground">Payment</Label>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <Button
                  key={m.code}
                  type="button"
                  variant={method === m.code ? "default" : "outline"}
                  className="h-11 flex-col gap-0 text-xs"
                  onClick={() => setMethod(m.code)}
                >
                  <m.icon className="mb-0.5" />
                  {m.label}
                </Button>
              ))}
            </div>
          </div>

          {method === "cash" ? (
            <div className="space-y-2">
              <Label htmlFor="tendered">Cash received</Label>
              <Input
                id="tendered"
                type="number"
                min={0}
                step={10}
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                className="h-11 text-right text-lg tabular-nums"
                placeholder={String(total)}
              />
              <div className="grid grid-cols-5 gap-1">
                <Button type="button" variant="secondary" size="sm" onClick={() => setTendered(String(total))}>
                  Exact
                </Button>
                {QUICK_CASH.map((n) => (
                  <Button key={n} type="button" variant="secondary" size="sm" onClick={() => setTendered(String(n))}>
                    {n.toLocaleString()}
                  </Button>
                ))}
              </div>
              <div
                className={cn(
                  "flex justify-between rounded-md px-3 py-2 text-sm",
                  change < 0 ? "bg-destructive/10 text-destructive" : "bg-muted",
                )}
              >
                <span>{change < 0 ? "Short by" : "Change"}</span>
                <span className="font-semibold tabular-nums">{pkr(Math.abs(change))}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="ref">Transaction ID / last 4 digits</Label>
              <Input id="ref" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className="h-11" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="phone">Customer mobile (optional)</Label>
            <Input
              id="phone"
              inputMode="tel"
              placeholder="03xx xxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <Button className="h-14 w-full text-lg" disabled={!canPay} onClick={checkout}>
            {busy ? "Saving…" : `Charge ${pkr(total)}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReceiptView({ receipt, onDone }: { receipt: Receipt; onDone: () => void }) {
  const methodLabel = METHODS.find((m) => m.code === receipt.payment_method)?.label ?? receipt.payment_method;
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <div className="flex gap-2 print:hidden">
        <Button className="h-12 flex-1" onClick={() => window.print()}>
          <Printer /> Print receipt
        </Button>
        <Button variant="outline" className="h-12 flex-1" onClick={onDone} autoFocus>
          Next customer
        </Button>
      </div>

      <div id="receipt" className="rounded-lg border bg-white p-5 font-mono text-sm text-black">
        <div className="text-center">
          <div className="text-lg font-bold">KHAZANAY</div>
          <div className="text-xs">Thrift · Karachi</div>
          <div className="mt-2 text-xs">{receipt.receipt_no}</div>
          <div className="text-xs">{new Date(receipt.sold_at).toLocaleString("en-PK")}</div>
        </div>
        <hr className="my-3 border-dashed border-black" />
        {receipt.lines.map((l) => (
          <div key={l.id} className="mb-1 flex justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate">
                {l.brand} {l.sub_category}
              </div>
              <div className="text-xs">
                {l.sku}
                {l.stage !== "full" ? ` · ${stageLabel(l.stage)}` : ""}
              </div>
            </div>
            <div className="tabular-nums">{pkr(l.sold_price)}</div>
          </div>
        ))}
        <hr className="my-3 border-dashed border-black" />
        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="tabular-nums">{pkr(receipt.subtotal)}</span>
          </div>
          {receipt.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount</span>
              <span className="tabular-nums">-{pkr(receipt.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>TOTAL</span>
            <span className="tabular-nums">{pkr(receipt.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>{methodLabel}</span>
            <span className="tabular-nums">{pkr(receipt.tendered ?? receipt.total)}</span>
          </div>
          {receipt.change_due != null && (
            <div className="flex justify-between">
              <span>Change</span>
              <span className="tabular-nums">{pkr(receipt.change_due)}</span>
            </div>
          )}
        </div>
        <hr className="my-3 border-dashed border-black" />
        <p className="text-center text-xs">Prices include sales tax. Exchange within 7 days with receipt. No refunds.</p>
        <p className="mt-1 text-center text-xs">Shukriya!</p>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #receipt,
          #receipt * {
            visibility: visible;
          }
          #receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            border: 0;
          }
        }
      `}</style>
    </div>
  );
}
