"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Adjustment, GradeCode } from "@/lib/pricing/constants";
import { CATEGORIES, SUB_CATEGORIES } from "@/lib/pricing/sub-categories";

type PriceResponse = {
  landed_cost: number;
  price: number | null;
  premium_price: number | null;
  grade_prices: Record<GradeCode, number> | null;
  markdowns: { stage: string; discount: number; price: number }[];
  gp_pct: number | null;
  brand: { name: string; tier: string; matched: boolean };
  multiple: number;
  block_reason?: string;
  warnings?: string[];
  error?: string;
};

const GRADES: { code: GradeCode; label: string }[] = [
  { code: "bnwt", label: "BNWT" },
  { code: "premium", label: "Premium" },
  { code: "excellent", label: "Excellent" },
  { code: "very_good", label: "Very Good" },
];

const ADJUSTMENTS: { code: Adjustment; label: string }[] = [
  { code: "below", label: "Below" },
  { code: "standard", label: "Standard" },
  { code: "above", label: "Above" },
];

const MARKDOWN_LABELS: Record<string, string> = { md1: "25% OFF", md2: "HALF PRICE", md3: "LAST CHANCE 75% OFF" };

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString()}`;

export function PriceTester() {
  const [category, setCategory] = useState(CATEGORIES[0].slug);
  const subs = SUB_CATEGORIES.filter((s) => s.categorySlug === category);
  const [sub, setSub] = useState(subs[0].slug);
  const [brand, setBrand] = useState("");
  const [grade, setGrade] = useState<GradeCode>("premium");
  const [adjustment, setAdjustment] = useState<Adjustment>("standard");
  const [rare, setRare] = useState(false);
  const [result, setResult] = useState<PriceResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  // Keep the sub-category valid when the category changes.
  useEffect(() => {
    if (!subs.some((s) => s.slug === sub)) setSub(subs[0].slug);
  }, [category, sub, subs]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch("/api/price", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ sub_category_id: sub, brand_text: brand, grade, adjustment, is_rare: rare }),
        });
        setResult(await res.json());
        setStatus(res.ok ? "idle" : "error");
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setStatus("error");
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [sub, brand, grade, adjustment, rare]);

  const selected = SUB_CATEGORIES.find((s) => s.slug === sub);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Garment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <select id="category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sub">Sub-category</Label>
            <select id="sub" className={selectClass} value={sub} onChange={(e) => setSub(e.target.value)}>
              {subs.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
            {selected && (
              <p className="text-xs text-muted-foreground">
                {selected.weightKg} kg · {selected.profileCode} profile · value index {selected.valueIndex}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="brand">Brand</Label>
            <Input id="brand" placeholder="e.g. Zara, Nike, Gucci" value={brand} onChange={(e) => setBrand(e.target.value)} autoComplete="off" />
            {result?.brand && brand && (
              <p className={cn("text-xs", result.brand.matched ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400")}>
                {result.brand.matched ? `${result.brand.name} — ${tierLabel(result.brand.tier)}` : "Unknown brand — priced as Regular"}
              </p>
            )}
          </div>

          <ButtonGroup label="Condition" options={GRADES} value={grade} onChange={setGrade} />
          <ButtonGroup label="Price adjustment" options={ADJUSTMENTS} value={adjustment} onChange={setAdjustment} />

          <div className="flex items-center gap-2">
            <Checkbox id="rare" checked={rare} onCheckedChange={(v) => setRare(v === true)} />
            <Label htmlFor="rare">Rare piece (two or more special triggers)</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Price
            {status === "loading" && <span className="text-xs font-normal text-muted-foreground">updating…</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {status === "error" && (
            <p className="rounded-md border border-red-600 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
              {result?.error ?? "Could not reach /api/price. Are you signed in?"}
            </p>
          )}

          {result?.block_reason && (
            <p className="rounded-md border border-red-600 bg-red-50 p-3 text-sm font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
              {result.block_reason}
            </p>
          )}

          {result && !result.block_reason && result.price != null && (
            <>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Our price</div>
                <div className="text-4xl font-bold tabular-nums">{pkr(result.price)}</div>
                <div className="text-xs text-muted-foreground">Price includes sales tax</div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {GRADES.map((g) => (
                  <div key={g.code} className={cn("flex justify-between", g.code === grade && "font-semibold")}>
                    <dt className="text-muted-foreground">{g.label}</dt>
                    <dd className="tabular-nums">{pkr(result.grade_prices![g.code])}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Markdown ladder</div>
                <dl className="space-y-1 text-sm">
                  {result.markdowns.map((m) => (
                    <div key={m.stage} className="flex justify-between">
                      <dt className="text-muted-foreground">{MARKDOWN_LABELS[m.stage] ?? m.stage}</dt>
                      <dd className="tabular-nums">{pkr(m.price)}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <dl className="space-y-1 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Landed cost</dt>
                  <dd className="tabular-nums">{pkr(result.landed_cost)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Gross margin on this piece</dt>
                  <dd className="tabular-nums">{(result.gp_pct! * 100).toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Profile multiple</dt>
                  <dd className="tabular-nums">{result.multiple.toFixed(4)}</dd>
                </div>
              </dl>
            </>
          )}

          {result?.warnings?.map((w) => (
            <p key={w} className="rounded-md border border-amber-600 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {w}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function tierLabel(tier: string) {
  return { regular: "Regular high street", affordable_luxury: "Affordable luxury", ultra_luxury: "Ultra luxury" }[tier] ?? tier;
}

function ButtonGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { code: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button key={o.code} type="button" size="sm" variant={o.code === value ? "default" : "outline"} onClick={() => onChange(o.code)}>
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
