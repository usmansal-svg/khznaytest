"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Printer, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Adjustment, ColourTag, GradeCode } from "@/lib/pricing/constants";
import { ADULT_SIZES, KIDS_SIZES } from "@/lib/pricing/kids-sizes";
import { SEASONS, WEARERS, type Season, type Wearer } from "@/lib/pricing/sku";

/* ---------------------------------------------------------------- types */

type Reference = {
  categories: { slug: string; name: string }[];
  sub_categories: {
    slug: string;
    code: string;
    category_slug: string;
    name: string;
    measure_type: string;
    measure_fields: string[];
    weight_kg: number;
    profile_code: string;
    value_index: number;
  }[];
  outlets: { id: number; name: string; is_online: boolean }[];
  lots: { id: number; code: string; supplier: string; basis: "kg" | "pc"; rate: number | null; effective_rate: number | null; yield: number; status: string }[];
  grades: { code: GradeCode; name: string }[];
  tagger: { name: string; role: string } | null;
  colour_tag: ColourTag;
  pricing_source: "database" | "defaults";
  warning?: string;
};

type PriceResponse = {
  cost_basis?: "lot" | "planning";
  weight_kg?: number | null;
  expected_revenue?: number | null;
  landed_cost: number;
  price: number | null;
  grade_prices: Record<GradeCode, number> | null;
  markdowns: { stage: string; discount: number; price: number }[];
  gp_pct: number | null;
  brand: { name: string; tier: string; matched: boolean };
  block_reason?: string;
  warnings?: string[];
  error?: string;
};

type Saved = {
  sku: string;
  list_price: number;
  status: string;
  brand: string;
  sub_category: string;
};

const GRADE_LABELS: Record<GradeCode, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const SELLABLE: GradeCode[] = ["bnwt", "premium", "excellent", "very_good"];
const ADJUSTMENTS: { code: Adjustment; label: string }[] = [
  { code: "below", label: "Below" },
  { code: "standard", label: "Standard" },
  { code: "above", label: "Above" },
];
const SEASON_LABELS: Record<Season, string> = { summer: "Summer", winter: "Winter", all_season: "All season" };
const WEARER_LABELS: Record<Wearer, string> = { men: "Men", women: "Women", boy: "Boy", girl: "Girl", infant: "Infant", unisex: "Unisex" };
const COLOUR_CLASS: Record<ColourTag, string> = {
  red: "bg-red-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  yellow: "bg-yellow-400",
};
const MARKDOWN_LABELS: Record<string, string> = { md1: "25% OFF", md2: "HALF PRICE", md3: "LAST CHANCE 75%" };
const KIDS = new Set<Wearer>(["boy", "girl", "infant"]);

const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/* ----------------------------------------------------------------- form */

export function TagForm() {
  const [ref, setRef] = useState<Reference | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Retained between garments
  const [lotId, setLotId] = useState<string>("");
  const [channel, setChannel] = useState<"outlet" | "online">("outlet");
  const [outletId, setOutletId] = useState<string>("");
  const [season, setSeason] = useState<Season>("summer");
  const [wearer, setWearer] = useState<Wearer>("men");
  const [category, setCategory] = useState("");
  const [sub, setSub] = useState("");

  // Cleared after save
  const [brand, setBrand] = useState("");
  const [brandHits, setBrandHits] = useState<{ name: string; tier: string }[]>([]);
  const [weight, setWeight] = useState("");
  const [size, setSize] = useState("");
  const [colour, setColour] = useState("");
  const [fabric, setFabric] = useState("");
  const [grade, setGrade] = useState<GradeCode>("premium");
  const [rare, setRare] = useState(false);
  const [unsure, setUnsure] = useState(false);
  const [flaw, setFlaw] = useState("");
  const [measure, setMeasure] = useState<Record<string, string>>({});
  const [adjustment, setAdjustment] = useState<Adjustment>("standard");
  const [manualPrice, setManualPrice] = useState("");

  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [pricing, setPricing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [sessionCount, setSessionCount] = useState(0);

  const brandRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);

  /* reference data */
  useEffect(() => {
    fetch("/api/reference")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Could not load reference data.");
        return j as Reference;
      })
      .then((data) => {
        setRef(data);
        if (!category && data.categories[0]) setCategory(data.categories[0].slug);
        if (!outletId && data.outlets[0]) setOutletId(String(data.outlets[0].id));
        if (!lotId && data.lots[0]) setLotId(String(data.lots[0].id));
      })
      .catch((e) => setLoadError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subs = useMemo(() => (ref?.sub_categories ?? []).filter((s) => s.category_slug === category), [ref, category]);
  useEffect(() => {
    if (subs.length && !subs.some((s) => s.slug === sub)) setSub(subs[0].slug);
  }, [subs, sub]);
  const selectedSub = subs.find((s) => s.slug === sub);
  const isKids = KIDS.has(wearer);
  const selectedLot = ref?.lots.find((l) => String(l.id) === lotId) ?? null;
  const needsWeight = selectedLot?.basis === "kg";
  const weightKg = Number(weight) || 0;
  const rejected = grade === "rejected";

  /* brand datalist */
  useEffect(() => {
    const q = brand.trim();
    if (!q) {
      setBrandHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/brands?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j) => setBrandHits(j.brands ?? []))
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [brand]);

  /* live price */
  useEffect(() => {
    if (!sub) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPricing(true);
      try {
        const res = await fetch("/api/price", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({ sub_category_id: sub, brand_text: brand, grade, adjustment, is_rare: rare, lot_id: lotId ? Number(lotId) : null, weight_kg: needsWeight && weightKg > 0 ? weightKg : null }),
        });
        setPrice(await res.json());
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setPrice({ error: "Could not reach /api/price." } as PriceResponse);
      } finally {
        setPricing(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [sub, brand, grade, adjustment, rare, lotId, weightKg, needsWeight]);

  const blocked = !rejected && Boolean(price?.block_reason);
  const needsManual = !rejected && (blocked || rare);
  const showFlaw = grade === "excellent" || grade === "very_good";
  const listPrice = rejected ? 0 : needsManual ? Number(manualPrice) || 0 : price?.price ?? 0;
  const weightOk = !needsWeight || weightKg > 0;
  const canSave =
    Boolean(ref?.tagger) && Boolean(sub) && Boolean(selectedLot) && weightOk && !saving && !price?.error &&
    (rejected ? price?.price === 0 : needsManual ? listPrice > 0 : Boolean(price?.price));

  const resetForNext = useCallback(() => {
    setBrand("");
    setWeight("");
    setSize("");
    setColour("");
    setFabric("");
    setGrade("premium");
    setRare(false);
    setUnsure(false);
    setFlaw("");
    setMeasure({});
    setAdjustment("standard");
    setManualPrice("");
    setSaved(null);
    setSaveError(null);
    requestAnimationFrame(() => brandRef.current?.focus());
  }, []);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sub_category_id: sub,
          brand_text: brand,
          grade,
          adjustment,
          is_rare: rare,
          is_unsure: unsure,
          flaw_note: showFlaw ? flaw : null,
          season,
          wearer,
          size_label: size,
          colour,
          fabric,
          measurements: Object.fromEntries(Object.entries(measure).filter(([, v]) => v !== "")),
          outlet_id: outletId ? Number(outletId) : null,
          lot_id: Number(lotId),
          weight_kg: needsWeight ? weightKg : null,
          channel,
          price_manual: needsManual ? Number(manualPrice) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      setSaved(json.item);
      setSessionCount((n) => n + 1);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // Enter saves (spec 12.1: keyboard-first). Textareas and the datalist inputs keep Enter.
  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    // Brand → Weight is the scale step; Enter on Brand moves there when the lot is by weight.
    if (e.target === brandRef.current && needsWeight && !weightKg) {
      weightRef.current?.focus();
      return;
    }
    if (saved) resetForNext();
    else void save();
  }

  if (loadError) return <p className="text-destructive">{loadError}</p>;
  if (!ref) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={onKeyDown}
      className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_360px]"
    >
      <div className="space-y-6">
        {/* ---------------------------------------------------- session */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Session</span>
              <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                This month&apos;s colour
                <span className={cn("inline-block size-4 rounded-full", COLOUR_CLASS[ref.colour_tag])} title={ref.colour_tag} />
                <span className="capitalize">{ref.colour_tag}</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tagger">
              {ref.tagger ? (
                <Input value={ref.tagger.name} readOnly className="bg-muted" />
              ) : (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Not signed in — <Link href="/login?next=/tag" className="underline">sign in with your PIN</Link> to save.
                </p>
              )}
            </Field>
            <Field
              label="Lot"
              hint={
                selectedLot
                  ? selectedLot.basis === "pc"
                    ? `Per piece · Rs ${selectedLot.rate?.toLocaleString()} each`
                    : `By weight · $${selectedLot.rate}/kg → $${selectedLot.effective_rate?.toFixed(2)}/kg effective at ${(selectedLot.yield * 100).toFixed(1)}% yield`
                  : ref.lots.length
                    ? undefined
                    : "No open lots — create one first"
              }
            >
              <div className="flex gap-2">
                <select className={selectClass} value={lotId} onChange={(e) => setLotId(e.target.value)}>
                  {ref.lots.length === 0 && <option value="">No open lots</option>}
                  {ref.lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} · {l.supplier} · {l.basis}
                    </option>
                  ))}
                </select>
                <Button asChild type="button" variant="outline" size="sm" className="h-9 shrink-0">
                  <Link href="/lots">Lots</Link>
                </Button>
              </div>
            </Field>
            <Field label="Tagging for" hint={channel === "online" ? "Photos and Shopify on the garment page after saving" : "Quick tag, print, then choose the outlet"}>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={channel === "outlet" ? "default" : "outline"} onClick={() => setChannel("outlet")}>Outlet</Button>
                <Button type="button" size="sm" variant={channel === "online" ? "default" : "outline"} onClick={() => setChannel("online")}>Online store</Button>
              </div>
            </Field>
            <Field label="Outlet">
              <select className={selectClass} value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                {ref.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="Season">
              <select className={selectClass} value={season} onChange={(e) => setSeason(e.target.value as Season)}>
                {SEASONS.map((s) => <option key={s} value={s}>{SEASON_LABELS[s]}</option>)}
              </select>
            </Field>
            <Field label="Wearer">
              <select className={selectClass} value={wearer} onChange={(e) => setWearer(e.target.value as Wearer)}>
                {WEARERS.map((w) => <option key={w} value={w}>{WEARER_LABELS[w]}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                {ref.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Sub-category" hint={selectedSub ? `${selectedSub.code} · ${selectedSub.weight_kg} kg · ${selectedSub.profile_code}` : undefined}>
              <select className={selectClass} value={sub} onChange={(e) => setSub(e.target.value)}>
                {subs.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </Field>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------- garment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Garment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Brand"
                hint={
                  price?.brand && brand
                    ? price.brand.matched
                      ? `${price.brand.name} — ${tierLabel(price.brand.tier)}`
                      : "Unknown brand — priced as Regular"
                    : "Tier resolves automatically"
                }
                hintTone={price?.brand && brand && !price.brand.matched ? "warn" : undefined}
              >
                <Input ref={brandRef} list="brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Start typing…" autoComplete="off" autoFocus />
                <datalist id="brands">{brandHits.map((b) => <option key={b.name} value={b.name}>{tierLabel(b.tier)}</option>)}</datalist>
              </Field>
              {needsWeight && (
                <Field label="Weight kg" hint="From the scale. This garment's own weight drives its cost.">
                  <Input ref={weightRef} type="number" inputMode="decimal" step="0.005" min="0.005" max="49" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.310" autoComplete="off" />
                </Field>
              )}
              <Field label="Size on label" hint={isKids ? kidsHint(size) : undefined}>
                <Input list="sizes" value={size} onChange={(e) => setSize(e.target.value)} placeholder={isKids ? "e.g. 4–5 Y or 4T" : "e.g. M or 32"} autoComplete="off" />
                <datalist id="sizes">
                  {(isKids ? KIDS_SIZES.map((k) => k.label) : ADULT_SIZES).map((s) => <option key={s} value={s} />)}
                </datalist>
              </Field>
              <Field label="Colour">
                <Input list="colours" value={colour} onChange={(e) => setColour(e.target.value)} placeholder="For the online listing" autoComplete="off" />
                <datalist id="colours">{COLOURS.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Fabric (optional)">
                <Input list="fabrics" value={fabric} onChange={(e) => setFabric(e.target.value)} autoComplete="off" />
                <datalist id="fabrics">{FABRICS.map((f) => <option key={f} value={f} />)}</datalist>
              </Field>
            </div>

            <ButtonGroup
              label="Condition"
              hint="Tags → BNWT · fabric used → Very Good · stain or repair → Excellent · else Premium. When in doubt, grade up."
              options={ref.grades.map((g) => ({ code: g.code, label: GRADE_LABELS[g.code] ?? g.name }))}
              value={grade}
              onChange={setGrade}
            />

            {rejected && (
              <Note tone="warn">Rejected — price 0. Still saved as an item so the reject rate is measured. Pull buttons and snaps, cut drawstrings, then bin it.</Note>
            )}

            {showFlaw && (
              <Field label="Flaw">
                <Input list="flaws" value={flaw} onChange={(e) => setFlaw(e.target.value)} placeholder="What and where" autoComplete="off" />
                <datalist id="flaws">{FLAWS.map((f) => <option key={f} value={f} />)}</datalist>
              </Field>
            )}

            {selectedSub && (
              <div>
                <Label className="mb-2 block">Measured flat (cm)</Label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {selectedSub.measure_fields.map((f) => (
                    <Field key={f} label={f} small>
                      <Input type="number" inputMode="decimal" step="0.5" min="0" value={measure[f] ?? ""} onChange={(e) => setMeasure((m) => ({ ...m, [f]: e.target.value }))} />
                    </Field>
                  ))}
                </div>
              </div>
            )}

            {!rejected && (
            <ButtonGroup
              label="Price adjustment"
              hint="Above: sells easily. Below: dated, extreme size, wrong season. Keep each under 15%."
              options={ADJUSTMENTS}
              value={adjustment}
              onChange={setAdjustment}
            />
            )}

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={rare} onCheckedChange={(v) => setRare(v === true)} /> Rare piece — two or more special triggers
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={unsure} onCheckedChange={(v) => setUnsure(v === true)} /> Unsure — send to QC
              </label>
            </div>

            {needsManual && (
              <Field label="Manual price (Rs)" hint={blocked ? price?.block_reason : "Rare pieces are priced by hand — 1.5× one trigger, 2× two or three, 3×+ genuinely rare."} hintTone="warn">
                <Input type="number" inputMode="numeric" min="1" step="1" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} className="max-w-xs" />
              </Field>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------------------------------- price */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Price
              {pricing && <span className="text-xs font-normal text-muted-foreground">updating…</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {price?.error && <Note tone="error">{price.error}</Note>}
            {blocked && !rare && <Note tone="error">{price?.block_reason}</Note>}

            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Our price</div>
              <div className="text-4xl font-bold tabular-nums">{listPrice ? pkr(listPrice) : "—"}</div>
              <div className="text-xs text-muted-foreground">Price includes sales tax</div>
            </div>

            {price?.cost_basis === "planning" && selectedLot && (
              <Note tone="warn">Weigh the garment to see its real price.</Note>
            )}

            {price?.grade_prices && !needsManual && !rejected && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {SELLABLE.map((g) => (
                  <div key={g} className={cn("flex justify-between", g === grade && "font-semibold")}>
                    <dt className="text-muted-foreground">{GRADE_LABELS[g]}</dt>
                    <dd className="tabular-nums">{pkr(price.grade_prices![g])}</dd>
                  </div>
                ))}
              </dl>
            )}

            {price?.markdowns?.length ? (
              <dl className="space-y-1 border-t pt-3 text-sm">
                {price.markdowns.map((m) => (
                  <div key={m.stage} className="flex justify-between">
                    <dt className="text-muted-foreground">{MARKDOWN_LABELS[m.stage] ?? m.stage}</dt>
                    <dd className="tabular-nums">{pkr(m.price)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {price && (
              <dl className="space-y-1 border-t pt-3 text-sm">
                {price.weight_kg != null && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Weight</dt>
                    <dd className="tabular-nums">{price.weight_kg.toFixed(3)} kg</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Landed cost</dt>
                  <dd className="tabular-nums">{pkr(price.landed_cost)}</dd>
                </div>
                {price.expected_revenue != null && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Expected revenue (ex-tax)</dt>
                    <dd className="tabular-nums">{pkr(price.expected_revenue)}</dd>
                  </div>
                )}
                {price.gp_pct != null && !needsManual && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Gross margin</dt>
                    <dd className="tabular-nums">{(price.gp_pct * 100).toFixed(1)}%</dd>
                  </div>
                )}
              </dl>
            )}

            {price?.warnings?.map((w) => <Note key={w} tone="warn">{w}</Note>)}
            {ref.warning && <Note tone="warn">{ref.warning}</Note>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            {saved ? (
              <>
                <Note tone="ok">
                  Saved <span className="font-mono font-semibold">{saved.sku}</span> · {pkr(saved.list_price)}
                  {saved.status === "set_aside" && " · set aside"}
                </Note>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild type="button" variant="outline">
                    <a href={`/items/${saved.sku}/print`} target="_blank" rel="noreferrer">
                      <Printer className="size-4" /> Print tag
                    </a>
                  </Button>
                  <Button asChild type="button" variant="outline">
                    <Link href={`/items/${saved.sku}`}>{channel === "online" ? "Photos & Shopify →" : "Choose outlet →"}</Link>
                  </Button>
                  <Button type="button" className="col-span-2" onClick={resetForNext}>
                    <RotateCcw className="size-4" /> Next garment
                  </Button>
                </div>
                <p className="text-center text-xs text-muted-foreground">Enter for next · lot, outlet, season and category are kept</p>
              </>
            ) : (
              <>
                {saveError && <Note tone="error">{saveError}</Note>}
                <Button type="submit" className="w-full" disabled={!canSave}>
                  <Save className="size-4" /> {saving ? "Saving…" : "Save & allocate SKU"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {ref.tagger ? "Enter saves" : "Sign in to save"} · {sessionCount} tagged this session
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- helpers */

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const COLOURS = ["Black", "White", "Grey", "Navy", "Blue", "Red", "Green", "Beige", "Brown", "Pink", "Yellow", "Orange", "Purple", "Multi"];
const FABRICS = ["Cotton", "Polyester", "Denim", "Wool", "Linen", "Silk", "Leather", "Suede", "Cashmere", "Fleece", "Nylon", "Blend"];
const FLAWS = ["Small stain front", "Small stain back", "Stain under arm", "Repaired seam", "Small hole repaired", "Pilling", "Fading", "Shape gone", "Missing button"];

function tierLabel(tier: string) {
  return { regular: "Regular high street", affordable_luxury: "Affordable luxury", ultra_luxury: "Ultra luxury" }[tier] ?? tier;
}

function kidsHint(size: string) {
  const hit = KIDS_SIZES.find((k) => k.label.toLowerCase() === size.trim().toLowerCase());
  return hit ? `${hit.heightCm} cm · measure ${hit.measure}` : "Copy the label exactly; the height range is added beside it";
}

function Field({ label, hint, hintTone, small, children }: { label: string; hint?: string; hintTone?: "warn"; small?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className={cn(small && "text-xs")}>{label}</Label>
      {children}
      {hint && <p className={cn("text-xs", hintTone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{hint}</p>}
    </div>
  );
}

function Note({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const cls = {
    ok: "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300",
    warn: "border-amber-600 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    error: "border-red-600 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300",
  }[tone];
  return <p className={cn("rounded-md border p-3 text-sm", cls)}>{children}</p>;
}

function ButtonGroup<T extends string>({ label, hint, options, value, onChange }: { label: string; hint?: string; options: { code: T; label: string }[]; value: T; onChange: (v: T) => void }) {
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
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
