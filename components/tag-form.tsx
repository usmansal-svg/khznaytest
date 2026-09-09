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
import { GENDER_LABELS, type Gender, type Season, type Wearer } from "@/lib/pricing/sku";
import { SLEEVE_TYPES } from "@/lib/pricing/sub-categories";

/* ---------------------------------------------------------------- types */

type Reference = {
  genders: { code: Gender; name: string }[];
  categories: { slug: string; name: string; gender: Gender; sort_order: number }[];
  sub_categories: {
    slug: string;
    code: string;
    category_slug: string;
    gender: Gender;
    name: string;
    measure_type: string;
    measure_fields: string[];
    asks_sleeve: boolean;
    weight_kg: number;
    profile_code: string;
    value_index: number;
  }[];
  outlets: { id: number; name: string; is_online: boolean }[];
  lots: { id: number; code: string; supplier: string; basis: "kg" | "pc"; rate: number | null; effective_rate: number | null; yield: number; status: string }[];
  grades: { code: GradeCode; name: string }[];
  tagger: { name: string; role: string; outlet_id: number | null } | null;
  colour_tag: ColourTag;
  pricing_source: "database" | "defaults";
  warning?: string;
};

type PriceResponse = {
  restricted?: boolean;
  cost_basis?: "lot" | "planning";
  weight_kg?: number | null;
  expected_revenue?: number | null;
  landed_cost: number | null;
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
const SEASON_OPTIONS: { code: Season; label: string }[] = [{ code: "summer", label: "Summer" }, { code: "winter", label: "Winter" }];
const WEARER_OPTIONS: { code: Wearer; label: string }[] = [{ code: "men", label: "Men" }, { code: "women", label: "Women" }, { code: "boy", label: "Boy" }, { code: "girl", label: "Girl" }, { code: "infant", label: "Infant" }, { code: "unisex", label: "Unisex" }];
const GENDER_ORDER: Gender[] = ["men", "women", "teenage", "kid", "toddler", "infant"];
/** Which genders' categories a wearer can be tagged under. */
const WEARER_GENDERS: Partial<Record<Wearer, Gender[]>> = { men: ["men"], women: ["women"], boy: ["kid", "toddler", "teenage"], girl: ["kid", "toddler", "teenage"], infant: ["infant", "toddler", "kid"], unisex: GENDER_ORDER };

const MARKDOWN_LABELS: Record<string, string> = { md1: "25% OFF", md2: "HALF PRICE", md3: "LAST CHANCE 75%" };
const KIDS = new Set<Wearer>(["boy", "girl", "infant"]);

const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/* ----------------------------------------------------------------- form */

export function TagForm() {
  const [ref, setRef] = useState<Reference | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Retained between garments
  const [lotId, setLotId] = useState<string>("");
  const [lotLocked, setLotLocked] = useState(false);
  const [channel, setChannel] = useState<"outlet" | "online">("outlet");
  const [channelLocked, setChannelLocked] = useState(false);
  const [season, setSeason] = useState<Season>("summer");
  const [wearer, setWearer] = useState<Wearer>("men");
  const [category, setCategory] = useState("");
  const [sub, setSub] = useState("");
  const [find, setFind] = useState("");

  // Cleared after save
  const [brand, setBrand] = useState("");
  const [brandHits, setBrandHits] = useState<{ name: string; tier: string }[]>([]);
  const [weight, setWeight] = useState("");
  const [size, setSize] = useState("");
  const [colour, setColour] = useState("");
  const [fabric, setFabric] = useState("");
  const [grade, setGrade] = useState<GradeCode>("premium");
  const [flaw, setFlaw] = useState("");
  const [measure, setMeasure] = useState<Record<string, string>>({});
  const [sleeve, setSleeve] = useState<string>("");
  const [adjustment, setAdjustment] = useState<Adjustment>("standard");
  const [manualPrice, setManualPrice] = useState("");

  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [pricing, setPricing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [sessionSkus, setSessionSkus] = useState<string[]>([]);

  const brandRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLIFrameElement>(null);
  const [autoPrint, setAutoPrint] = useState(true);
  const [printing, setPrinting] = useState<string | null>(null);

  // Print without leaving the form: the tag page loads in a hidden frame
  // and prints itself (?auto=1). Works with AirPrint on the iPad.
  function printTag(sku: string) {
    setPrinting(sku);
    if (printRef.current) printRef.current.src = `/items/${encodeURIComponent(sku)}/print?auto=1&embed=1&t=${Date.now()}`;
  }

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
        if (!lotId && data.lots[0]) setLotId(String(data.lots[0].id));
      })
      .catch((e) => setLoadError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wearer → Category → Sub-category. Categories are gendered; the wearer
  // decides which genders show. A type-to-find box jumps straight to a
  // sub-category and fills the category in.
  const genders = WEARER_GENDERS[wearer] ?? GENDER_ORDER;
  const cats = useMemo(
    () => (ref?.categories ?? []).filter((c) => genders.includes(c.gender)).sort((a, b) => GENDER_ORDER.indexOf(a.gender) - GENDER_ORDER.indexOf(b.gender) || a.sort_order - b.sort_order),
    [ref, genders],
  );
  useEffect(() => {
    if (cats.length && !cats.some((c) => c.slug === category)) setCategory(cats[0].slug);
  }, [cats, category]);
  const subs = useMemo(() => (ref?.sub_categories ?? []).filter((s) => s.category_slug === category).sort((a, b) => a.name.localeCompare(b.name)), [ref, category]);
  useEffect(() => {
    if (subs.length && !subs.some((s) => s.slug === sub)) setSub(subs[0].slug);
  }, [subs, sub]);
  const selectedSub = (ref?.sub_categories ?? []).find((s) => s.slug === sub);
  const catSlugs = useMemo(() => new Set(cats.map((c) => c.slug)), [cats]);
  const hits = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return [];
    return (ref?.sub_categories ?? []).filter((s) => catSlugs.has(s.category_slug) && s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [find, ref, catSlugs]);
  function pick(s: NonNullable<Reference["sub_categories"]>[number]) {
    setCategory(s.category_slug);
    setSub(s.slug);
    setFind("");
    requestAnimationFrame(() => brandRef.current?.focus());
  }
  const isKids = KIDS.has(wearer);
  const asksSleeve = Boolean(selectedSub?.asks_sleeve);
  const isManager = ref?.tagger?.role === "manager" || ref?.tagger?.role === "founder";
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
          body: JSON.stringify({ sub_category_id: sub, brand_text: brand, grade, adjustment, lot_id: lotId ? Number(lotId) : null, weight_kg: needsWeight && weightKg > 0 ? weightKg : null }),
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
  }, [sub, brand, grade, adjustment, lotId, weightKg, needsWeight]);

  const blocked = !rejected && Boolean(price?.block_reason);
  const needsManual = !rejected && blocked;
  const showFlaw = grade === "excellent" || grade === "very_good";
  const listPrice = rejected ? 0 : needsManual ? Number(manualPrice) || 0 : price?.price ?? 0;
  const weightOk = !needsWeight || weightKg > 0;
  const sleeveOk = !asksSleeve || Boolean(sleeve);
  const canSave =
    Boolean(ref?.tagger) && Boolean(sub) && Boolean(selectedLot) && weightOk && sleeveOk && !saving && !price?.error &&
    (rejected ? price?.price === 0 : needsManual ? listPrice > 0 : Boolean(price?.price));

  const resetForNext = useCallback(() => {
    setBrand("");
    setWeight("");
    setSize("");
    setColour("");
    setFabric("");
    setGrade("premium");
    setFlaw("");
    setMeasure({});
    setSleeve("");
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
          flaw_note: showFlaw ? flaw : null,
          season,
          wearer,
          size_label: size,
          colour,
          fabric,
          measurements: { ...Object.fromEntries(Object.entries(measure).filter(([, v]) => v !== "")), ...(asksSleeve && sleeve ? { Sleeve: sleeve } : {}) },
          outlet_id: null,
          lot_id: Number(lotId),
          weight_kg: needsWeight ? weightKg : null,
          channel,
          price_manual: needsManual ? Number(manualPrice) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      setSaved(json.item);
      setSessionSkus((list) => [...list, json.item.sku]);
      if (autoPrint && json.item.status !== "rejected") printTag(json.item.sku);
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
    <>
    <iframe ref={printRef} title="print" aria-hidden className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0" onLoad={() => setTimeout(() => setPrinting(null), 1500)} />
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
              <span className="text-xs font-normal text-muted-foreground">Lock what stays the same, then tag garment after garment</span>
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

            <Field label="Tagging for" hint={channelLocked ? "Locked — untick to change" : channel === "online" ? "Photos and Shopify on the garment page after saving" : "Quick tag and print; the supervisor sends it to an outlet"}>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant={channel === "outlet" ? "default" : "outline"} disabled={channelLocked} onClick={() => setChannel("outlet")} className="h-11 md:h-8">Outlet</Button>
                <Button type="button" size="sm" variant={channel === "online" ? "default" : "outline"} disabled={channelLocked} onClick={() => setChannel("online")} className="h-11 md:h-8">Online store</Button>
                <label className="ml-auto flex items-center gap-1.5 text-xs"><Checkbox checked={channelLocked} onCheckedChange={(v) => setChannelLocked(v === true)} /> Lock</label>
              </div>
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
                    : "No open lots — ask a manager to create one"
              }
            >
              <div className="flex items-center gap-2">
                <select className={selectClass} value={lotId} disabled={lotLocked} onChange={(e) => setLotId(e.target.value)}>
                  {ref.lots.length === 0 && <option value="">No open lots</option>}
                  {ref.lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} · {l.supplier} · {l.basis}
                    </option>
                  ))}
                </select>
                <label className="flex shrink-0 items-center gap-1.5 text-xs"><Checkbox checked={lotLocked} onCheckedChange={(v) => setLotLocked(v === true)} /> Lock</label>
                {isManager && (
                  <Button asChild type="button" variant="outline" size="sm" className="h-9 shrink-0">
                    <Link href="/lots">Lots</Link>
                  </Button>
                )}
              </div>
            </Field>

            <Field label="Season">
              <select className={selectClass} value={season} onChange={(e) => setSeason(e.target.value as Season)}>
                {SEASON_OPTIONS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Wearer">
              <select className={selectClass} value={wearer} onChange={(e) => setWearer(e.target.value as Wearer)}>
                {WEARER_OPTIONS.map((w) => <option key={w.code} value={w.code}>{w.label}</option>)}
              </select>
            </Field>
            <Field label="Find a garment type" hint="Type a few letters — e.g. crop, jeans, hoodie">
              <div className="relative">
                <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search sub-categories…" autoComplete="off" onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); e.stopPropagation(); pick(hits[0]); } }} />
                {hits.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-background shadow-md">
                    {hits.map((h) => (
                      <li key={h.slug}><button type="button" onClick={() => pick(h)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"><span>{h.name}</span><span className="text-xs text-muted-foreground">{ref.categories.find((c) => c.slug === h.category_slug)?.name}</span></button></li>
                    ))}
                  </ul>
                )}
              </div>
            </Field>
            <Field label="Category">
              <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                {genders.length > 1
                  ? GENDER_ORDER.filter((g) => cats.some((c) => c.gender === g)).map((g) => (
                      <optgroup key={g} label={GENDER_LABELS[g]}>{cats.filter((c) => c.gender === g).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</optgroup>
                    ))
                  : cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                {cats.length === 0 && <option value="">No categories for this wearer yet</option>}
              </select>
            </Field>
            <Field label="Sub-category" hint={selectedSub ? `${selectedSub.code} · ${selectedSub.weight_kg} kg · ${selectedSub.profile_code}` : subs.length ? undefined : "Nothing under this category yet — add it under Pricing"}>
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
              <div className="space-y-3">
                {asksSleeve && (
                  <ButtonGroup label="Sleeves" hint={!sleeve ? "Required before saving" : undefined} options={SLEEVE_TYPES.map((t) => ({ code: t, label: t }))} value={sleeve as (typeof SLEEVE_TYPES)[number]} onChange={(v) => setSleeve(v)} />
                )}
                <div>
                  <Label className="mb-2 block">Measured flat (inches)</Label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {selectedSub.measure_fields.map((f) => (
                      <Field key={f} label={f} small>
                        <Input type="number" inputMode="decimal" step="0.5" min="0" value={measure[f] ?? ""} onChange={(e) => setMeasure((m) => ({ ...m, [f]: e.target.value }))} />
                      </Field>
                    ))}
                  </div>
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

            {needsManual && (
              <Field label="Manual price (Rs)" hint={price?.block_reason} hintTone="warn">
                <Input type="number" inputMode="numeric" min="1" step="1" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} className="max-w-xs" />
              </Field>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------------------------------- price */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:border-t max-lg:bg-background max-lg:p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Price
              {pricing && <span className="text-xs font-normal text-muted-foreground">updating…</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {price?.error && <Note tone="error">{price.error}</Note>}
            {blocked && <Note tone="error">{price?.block_reason}</Note>}

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

            {price && !price.restricted && price.markdowns?.length ? (
              <dl className="space-y-1 border-t pt-3 text-sm">
                {price.markdowns.map((m) => (
                  <div key={m.stage} className="flex justify-between">
                    <dt className="text-muted-foreground">{MARKDOWN_LABELS[m.stage] ?? m.stage}</dt>
                    <dd className="tabular-nums">{pkr(m.price)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {price && !price.restricted && (
              <dl className="space-y-1 border-t pt-3 text-sm">
                {price.weight_kg != null && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Weight</dt>
                    <dd className="tabular-nums">{price.weight_kg.toFixed(3)} kg</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Landed cost</dt>
                  <dd className="tabular-nums">{pkr(price.landed_cost ?? 0)}</dd>
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

        {sessionSkus.length > 0 && (
          <Button asChild variant="outline" className="w-full">
            <a href={`/print?skus=${sessionSkus.join(",")}`} target="_blank" rel="noreferrer"><Printer className="size-4" /> Print all {sessionSkus.length} tags from this session</a>
          </Button>
        )}
        <Card>
          <CardContent className="space-y-3 pt-6">
            {saved ? (
              <>
                <Note tone="ok">
                  Saved <span className="font-mono font-semibold">{saved.sku}</span> · {pkr(saved.list_price)}
                  {saved.status === "set_aside" && " · set aside"}
                </Note>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="h-12" onClick={() => printTag(saved.sku)}>
                    <Printer className="size-4" /> {printing === saved.sku ? "Printing…" : "Print tag"}
                  </Button>
                  {channel === "online" ? (
                    <Button asChild type="button" variant="outline" className="h-12"><Link href={`/items/${saved.sku}`}>Photos & Shopify →</Link></Button>
                  ) : (
                    <Button type="button" className="h-12" onClick={resetForNext}><RotateCcw className="size-4" /> Next garment</Button>
                  )}
                  {channel === "online" && (
                    <Button type="button" className="col-span-2 h-12" onClick={resetForNext}><RotateCcw className="size-4" /> Next garment</Button>
                  )}
                </div>
                <p className="text-center text-xs text-muted-foreground">Enter for next · channel, lot, season, wearer and category are kept</p>
              </>
            ) : (
              <>
                {saveError && <Note tone="error">{saveError}</Note>}
                <Button type="submit" className="h-12 w-full" disabled={!canSave}>
                  <Save className="size-4" /> {saving ? "Saving…" : autoPrint ? "Save & print tag" : "Save & allocate SKU"}
                </Button>
                <label className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Checkbox checked={autoPrint} onCheckedChange={(v) => setAutoPrint(v === true)} /> Auto-print the tag after every save</label>
                <p className="text-center text-xs text-muted-foreground">
                  {ref.tagger ? "Enter saves" : "Sign in to save"} · {sessionSkus.length} tagged this session
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
    </>
  );
}

/* -------------------------------------------------------------- helpers */

const selectClass =
  "flex h-11 md:h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base md:text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

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
          <Button key={o.code} type="button" size="sm" variant={o.code === value ? "default" : "outline"} onClick={() => onChange(o.code)} className="h-11 px-4 text-sm md:h-8 md:px-3 md:text-xs">
            {o.label}
          </Button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
