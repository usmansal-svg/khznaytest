"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Printer, RotateCcw, Save } from "lucide-react";
import { downscale, uploadPhoto } from "@/lib/photos";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GRADE_RANK, type ColourTag, type GradeCode } from "@/lib/pricing/constants";
import { ADULT_SIZES, KIDS_SIZES } from "@/lib/pricing/kids-sizes";
import { sizeSeriesFor } from "@/lib/pricing/sizes";
import { rareTagLine } from "@/lib/pricing/rare-reasons";
import { GENDER_LABELS, type Gender, type Season, type Wearer, WEARER_OPTIONS, WEARER_LABELS, WEARER_GENDERS, isChildWearer } from "@/lib/pricing/sku";
import { SLEEVE_TYPES } from "@/lib/pricing/sub-categories";

/* ---------------------------------------------------------------- types */

type Reference = {
  genders: { code: Gender; name: string }[];
  top_brands: { name: string; logo_url: string | null }[];
  size_extras: Record<string, string[]>;
  rare_reasons: { code: string; label: string; tag: string; web: string }[];
  brand_picks_by_category: Record<string, { name: string; logo_url: string | null }[]>;
  categories: { slug: string; name: string; gender: Gender; sort_order: number; for_wearer?: "any" | "girls" | "boys" }[];
  sub_categories: {
    slug: string;
    code: string;
    category_slug: string;
    gender: Gender;
    name: string;
    measure_type: string;
    season: "summer" | "winter" | "all";
    measure_fields: string[];
    asks_sleeve: boolean;
    weight_kg: number;
    profile_code: string;
    value_index: number;
    has_heavy?: boolean;
  }[];
  outlets: { id: number; name: string; is_online: boolean }[];
  lots: { id: number; code: string; description: string | null; pieces: number | null; tagged: number; status: string }[];
  grades: { code: GradeCode; name: string }[];
  outlet_min_grade: GradeCode;
  tagger: { name: string; role: string; outlet_id: number | null; today: number; target: number } | null;
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
  standard_price?: number | null;
  adjust_pct?: number;
  grade_prices: Record<GradeCode, number> | null;
  markdowns: { stage: string; discount: number; price: number }[];
  gp_pct: number | null;
  brand: { name: string; tier: string; matched: boolean; corrected_from?: string; is_new?: boolean };
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
const SEASON_OPTIONS: { code: Season; label: string }[] = [{ code: "summer", label: "Summer" }, { code: "winter", label: "Winter" }];
const GENDER_ORDER: Gender[] = ["men", "women", "teenage", "kid", "toddler", "infant"];

const MARKDOWN_LABELS: Record<string, string> = { md1: "25% OFF", md2: "HALF PRICE", md3: "LAST CHANCE 75%" };

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
  const [moreBrands, setMoreBrands] = useState(false);
  const [size, setSize] = useState("");
  // Size buttons: the series is chosen by the garment (collar for shirts,
  // waist for bottoms, letters otherwise); the switch flips to the other.
  const [sizeSeriesCode, setSizeSeriesCode] = useState<string | null>(null);
  const [sizeOther, setSizeOther] = useState(false);
  const [colour, setColour] = useState("");
  const [grade, setGrade] = useState<GradeCode>("premium");
  const [heavy, setHeavy] = useState(false);
  const [measure, setMeasure] = useState<Record<string, string>>({});
  const [sleeve, setSleeve] = useState<string>("Half sleeve");
  const [adjustPct, setAdjustPct] = useState(0);
  const [manualOn, setManualOn] = useState(false);
  const [rareFind, setRareFind] = useState(false);
  const [rareWhy, setRareWhy] = useState<string[]>([]);
  const [rareText, setRareText] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [belowReason, setBelowReason] = useState("");

  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [pricing, setPricing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [qcHold, setQcHold] = useState<string | null>(null);
  // Deliberate send-to-outlet of a garment below the minimum: asked twice, per garment.
  const [outletOverride, setOutletOverride] = useState(false);
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [sessionSkus, setSessionSkus] = useState<string[]>([]);


  const brandRef = useRef<HTMLInputElement>(null);
  const sizeRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLIFrameElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const blob = await downscale(f);
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto({ blob, url: URL.createObjectURL(blob) });
    requestAnimationFrame(() => brandRef.current?.focus());
  }
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
  // Season narrows the catalogue: a summer tagger never sees coats, a winter
  // tagger never sees shorts. "All year" sub-categories show in both.
  const inSeason = useCallback((s: { season: "summer" | "winter" | "all" }) => s.season === "all" || s.season === season, [season]);
  const cats = useMemo(
    () => (ref?.categories ?? [])
      .filter((c) => genders.includes(c.gender) && (c.for_wearer ?? "any") !== (/_boy$/.test(wearer) ? "girls" : /_girl$/.test(wearer) ? "boys" : "") && (ref?.sub_categories ?? []).some((s) => s.category_slug === c.slug && inSeason(s)))
      .sort((a, b) => GENDER_ORDER.indexOf(a.gender) - GENDER_ORDER.indexOf(b.gender) || a.sort_order - b.sort_order),
    [ref, genders, inSeason, wearer],
  );
  useEffect(() => {
    if (cats.length && !cats.some((c) => c.slug === category)) setCategory(cats[0].slug);
  }, [cats, category]);
  const subs = useMemo(() => (ref?.sub_categories ?? []).filter((s) => s.category_slug === category && inSeason(s)).sort((a, b) => a.name.localeCompare(b.name)), [ref, category, inSeason]);
  useEffect(() => {
    if (subs.length && !subs.some((s) => s.slug === sub)) setSub(subs[0].slug);
  }, [subs, sub]);
  const selectedSub = (ref?.sub_categories ?? []).find((s) => s.slug === sub);
  const catSlugs = useMemo(() => new Set(cats.map((c) => c.slug)), [cats]);
  const hits = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return [];
    return (ref?.sub_categories ?? []).filter((s) => catSlugs.has(s.category_slug) && inSeason(s) && s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [find, ref, catSlugs, inSeason]);
  function pick(s: NonNullable<Reference["sub_categories"]>[number]) {
    setCategory(s.category_slug);
    setSub(s.slug);
    setFind("");
    requestAnimationFrame(() => brandRef.current?.focus());
  }
  const isKids = isChildWearer(wearer);
  // Quick-pick brands follow the category: sports piles want Nike and Puma,
  // shirt piles want Calvin Klein and Zara. The general list is the fallback.
  const quickBrands = useMemo(() => {
    const catName = ref?.categories.find((c) => c.slug === category)?.name;
    const list = catName ? ref?.brand_picks_by_category[catName] : undefined;
    return list && list.length ? list : ref?.top_brands ?? [];
  }, [ref, category]);
  const [sizeExtras, setSizeExtras] = useState<Record<string, string[]> | null>(null);
  const sizeSeries = useMemo(() => sizeSeriesFor(selectedSub ?? null, KIDS_SIZES.map((k) => k.label), isKids, sizeExtras ?? ref?.size_extras ?? {}), [selectedSub, isKids, sizeExtras, ref]);
  // "+" at the end of a size row: add a label that is missing from the
  // series (a 24 waist, an XXS). Shared by every iPad from then on.
  async function addSizeLabel(series: string) {
    const label = window.prompt(`Add a size to the ${activeSeries.label} row — type it exactly as on the label:`)?.trim();
    if (!label) return;
    const res = await fetch("/api/sizes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ series, label }) });
    const j = await res.json();
    if (!res.ok) { window.alert(j.error ?? "Could not add that size."); return; }
    setSizeExtras((e) => { const base = e ?? ref?.size_extras ?? {}; return { ...base, [series]: [...(base[series] ?? []), j.label] }; });
    setSize(j.label);
  }
  const activeSeries = sizeSeries.find((s) => s.code === sizeSeriesCode) ?? sizeSeries[0];
  // A new garment type resets the switch to that type's own series.
  useEffect(() => { setSizeSeriesCode(null); setSizeOther(false); }, [sub, isKids]);
  const asksSleeve = Boolean(selectedSub?.asks_sleeve);
  const isManager = ref?.tagger?.role === "manager" || ref?.tagger?.role === "founder";
  const selectedLot = ref?.lots.find((l) => String(l.id) === lotId) ?? null;
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
          body: JSON.stringify({ sub_category_id: sub, brand_text: brand, grade, adjust_pct: adjustPct, is_rare: rareFind, lot_id: lotId ? Number(lotId) : null, heavy: heavy && Boolean(selectedSub?.has_heavy) }),
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
  }, [sub, brand, grade, adjustPct, lotId, rareFind, heavy, selectedSub?.has_heavy]);

  const blocked = !rejected && Boolean(price?.block_reason);
  // No hand-off: an ultra-luxury brand (blocked) must be priced by hand; a
  // rare find prices as normal or by hand at the senior's price.
  const needsManual = !rejected && (manualOn || blocked);
  const rareOk = !rareFind || rareWhy.length > 0;
  const rareLine = rareFind ? rareTagLine(rareWhy, rareText, ref?.rare_reasons ?? []) : "";
  const rareChosen = ref?.rare_reasons.find((r) => r.code === rareWhy[0]);
  const listPrice = rejected ? 0 : needsManual ? Number(manualPrice) || 0 : price?.price ?? 0;
  const standardPrice = price?.standard_price ?? null;
  const below = !rejected && !blocked && standardPrice != null && listPrice > 0 && listPrice < standardPrice;
  const belowPct = below ? Math.round(((standardPrice! - listPrice) / standardPrice!) * 100) : 0;
  const weightOk = true;
  // Outlet: a concise form — the garment type (for the price and SKU), brand,
  // size, condition, price and a reference photo. Season comes from the month;
  // colour, measurements and sleeves are online-listing details.
  // Online: every detail, but no photo here — the photography station takes
  // proper pictures after the tag is on (see /photos).
  const outlet = channel === "outlet";
  const sleeveOk = !asksSleeve || Boolean(sleeve);
  const reasonOk = !below || belowReason.trim().length >= 3;
  const photoOk = !outlet || Boolean(photo) || rejected;
  // Outlets take only the better conditions. Under the outlet channel a
  // garment below the minimum is not tagged at all — it goes on the pile
  // for online tagging. The server refuses the save as well.
  const belowOutletMin = channel === "outlet" && !rejected && ref != null && GRADE_RANK[grade] < GRADE_RANK[ref.outlet_min_grade] && !outletOverride;
  const canSave =
    Boolean(ref?.tagger) && Boolean(sub) && Boolean(selectedLot) && weightOk && sleeveOk && reasonOk && photoOk && !saving && !price?.error && !belowOutletMin &&
    rareOk && (rejected ? price?.price === 0 : needsManual ? listPrice > 0 : Boolean(price?.price));

  const resetForNext = useCallback(() => {
    setBrand("");
    setSize("");
    setColour("");
    setGrade("premium");
    setOutletOverride(false);
    setConfirmOverride(false);
    setMeasure({});
    setSleeve("");
    setAdjustPct(0);
    setManualOn(false);
    setRareFind(false);
    setRareWhy([]);
    setRareText("");
    setManualPrice("");
    setBelowReason("");
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setPhotoError(null);
    setSaved(null);
    setSaveError(null);
    requestAnimationFrame(() => brandRef.current?.focus());
  }, [photo]);

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
          adjust_pct: adjustPct,
          is_rare: rareFind,
          rare_reasons: rareFind ? rareWhy : [],
          rare_note: rareFind ? rareText.trim() || null : null,
          below_reason: below ? belowReason : null,
          flaw_note: null,
          season,
          wearer,
          size_label: size,
          colour: outlet ? null : colour,
          fabric: null,
          measurements: { ...(outlet ? {} : Object.fromEntries(Object.entries(measure).filter(([, v]) => v !== ""))), ...(asksSleeve && sleeve ? { Sleeve: sleeve } : {}) },
          outlet_id: null,
          lot_id: Number(lotId),
          heavy: heavy && Boolean(selectedSub?.has_heavy),
          channel,
          outlet_override: outletOverride,
          price_manual: needsManual ? Number(manualPrice) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      setSaved(json.item);
      setSessionSkus((list) => [...list, json.item.sku]);
      if (json.qc_hold) setQcHold(json.item.sku);
      // The photo is the record of the garment; it goes up the moment the SKU exists.
      if (photo) {
        try {
          await uploadPhoto(json.item.sku, photo.blob);
        } catch (err) {
          setPhotoError(err instanceof Error ? err.message : "Photo upload failed.");
        }
      }
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
    if (saved) resetForNext();
    else void save();
  }

  if (loadError) return <p className="text-destructive">{loadError}</p>;
  if (!ref) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <>
    {qcHold && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" role="alertdialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl border-4 border-amber-500 bg-background p-8 text-center shadow-2xl">
          <div className="text-5xl">🛑</div>
          <h2 className="mt-3 text-2xl font-bold">Quality control</h2>
          <p className="mt-2 text-lg">Keep <span className="font-mono font-semibold">{qcHold}</span> aside on the QC rail.</p>
          <p className="mt-1 text-sm text-muted-foreground">This garment was picked at random for a senior to regrade. Its tag has printed — attach it, then put the garment on the rail, not in the box. It cannot ship until it is released.</p>
          <Button type="button" size="lg" className="mt-6 h-14 w-full text-lg" onClick={() => setQcHold(null)}>I&apos;ve set it aside</Button>
        </div>
      </div>
    )}
    <iframe ref={printRef} title="print" aria-hidden className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0" onLoad={() => setTimeout(() => setPrinting(null), 1500)} />
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={onKeyDown}
      className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_260px]"
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
            <Field label="Tagger" hint={ref.tagger ? `${ref.tagger.today + sessionSkus.length} of ${ref.tagger.target} today · ${Math.round(((ref.tagger.today + sessionSkus.length) / Math.max(1, ref.tagger.target)) * 100)}%` : undefined}>
              {ref.tagger ? (
                <div className="space-y-1">
                  <Input value={ref.tagger.name} readOnly className="bg-muted" />
                  <div className="h-1.5 rounded bg-muted"><div className={cn("h-1.5 rounded", ref.tagger.today + sessionSkus.length >= ref.tagger.target ? "bg-green-600" : "bg-foreground/70")} style={{ width: `${Math.min(100, ((ref.tagger.today + sessionSkus.length) / Math.max(1, ref.tagger.target)) * 100)}%` }} /></div>
                </div>
              ) : (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Not signed in — <Link href="/login?next=/tag" className="underline">sign in with your PIN</Link> to save.
                </p>
              )}
            </Field>

            <Field label="Tagging for" hint={channelLocked ? "Locked — untick to change" : channel === "online" ? "Full details; photos are taken at the photography station after the tag is on" : "Short form: type, brand, size, condition, price, reference photo"}>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant={channel === "outlet" ? "default" : "outline"} disabled={channelLocked} onClick={() => setChannel("outlet")} className="h-11 md:h-8">Outlet</Button>
                <Button type="button" size="sm" variant={channel === "online" ? "default" : "outline"} disabled={channelLocked} onClick={() => setChannel("online")} className="h-11 md:h-8">Online store</Button>
                <label className="ml-1 flex items-center gap-1.5 text-xs"><Checkbox checked={channelLocked} onCheckedChange={(v) => setChannelLocked(v === true)} /> Lock</label>
              </div>
            </Field>

            <Field
              label="Lot"
              hint={
                selectedLot
                  ? `${selectedLot.tagged}${selectedLot.pieces ? ` of ${selectedLot.pieces}` : ""} tagged · records where this garment came from`
                  : ref.lots.length
                    ? undefined
                    : "No open lots — record the lot in the commercial software first"
              }
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <select className={cn(selectClass, "min-w-0 flex-1 basis-40")} value={lotId} disabled={lotLocked} onChange={(e) => setLotId(e.target.value)}>
                  {ref.lots.length === 0 && <option value="">No open lots</option>}
                  {ref.lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code}{l.description ? ` · ${l.description}` : ""}
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

            <ButtonGroup label="Season" hint="Shows that season's catalogue; goes into the SKU and the Shopify tags" options={SEASON_OPTIONS} value={season} onChange={setSeason} />
            {asksSleeve && <ButtonGroup label="Sleeves" hint="Goes to Shopify as a filter tag; the same garment type covers every sleeve length" options={SLEEVE_TYPES.map((t) => ({ code: t, label: t }))} value={sleeve as (typeof SLEEVE_TYPES)[number]} onChange={(v) => setSleeve(v)} />}
            {selectedSub?.has_heavy && <ButtonGroup label="Weight" hint="This garment type has a heavy version: a heavy piece prices from its heavy cost. Same tag on the website." options={[{ code: "light", label: "Regular" }, { code: "heavy", label: "Heavy" }]} value={heavy ? "heavy" : "light"} onChange={(v) => setHeavy(v === "heavy")} />}
            <Field label="Wearer">
              <select className={selectClass} value={wearer} onChange={(e) => setWearer(e.target.value as Wearer)}>
                {WEARER_OPTIONS.map((w) => <option key={w} value={w}>{WEARER_LABELS[w]}</option>)}
              </select>
            </Field>
            <Field label="Find a garment type" hint="Shortcut — type a few letters, e.g. crop, jeans">
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
            <div className="grid gap-2 sm:col-span-2">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => (
                  <Button key={c.slug} type="button" size="sm" variant={c.slug === category ? "default" : "outline"} onClick={() => setCategory(c.slug)} className="h-11 px-4 text-sm md:h-8 md:px-3 md:text-xs">
                    {genders.length > 1 ? `${GENDER_LABELS[c.gender]} · ${c.name}` : c.name}
                  </Button>
                ))}
                {cats.length === 0 && <p className="text-xs text-muted-foreground">No categories for this wearer yet — add one under Pricing.</p>}
              </div>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Sub-category {selectedSub && <span className="font-normal text-muted-foreground">· {selectedSub.code}{outlet ? "" : ` · ${selectedSub.profile_code}`}</span>}</Label>
              <div className="flex flex-wrap gap-2">
                {subs.map((sc) => (
                  <Button key={sc.slug} type="button" size="sm" variant={sc.slug === sub ? "default" : "outline"} onClick={() => { setSub(sc.slug); requestAnimationFrame(() => brandRef.current?.focus()); }} className="h-11 px-4 text-sm md:h-8 md:px-3 md:text-xs">
                    {sc.name}
                  </Button>
                ))}
                {subs.length === 0 && <p className="text-xs text-muted-foreground">Nothing under this category yet — add it under Pricing.</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------- garment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Garment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
            {!outlet && (
              <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">No photo here. Once the tag is printed the garment goes to the photography station, where its pictures are taken against the SKU (Photos in the menu).</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Brand"
                hint={
                  price?.brand && brand
                    ? price.brand.matched
                      ? `${price.brand.corrected_from ? `Using ${price.brand.name} (you typed "${price.brand.corrected_from}")` : price.brand.name} — ${tierLabel(price.brand.tier)}`
                      : `New brand — will be added as "${price.brand.name}" (Regular) when you save`
                    : "Tier resolves automatically; misspellings are corrected"
                }
                hintTone={price?.brand && brand && (!price.brand.matched || price.brand.corrected_from) ? "warn" : undefined}
              >
                <div className="flex gap-2">
                  <Input ref={brandRef} list="brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Tap a brand below, or type a rarer one" autoComplete="off" autoFocus onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); sizeRef.current?.focus(); } }} />
                </div>
                {quickBrands.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {quickBrands.slice(0, moreBrands ? 20 : 10).map((b) => {
                      const on = brand.trim().toLowerCase() === b.name.toLowerCase();
                      return (
                        <Button key={b.name} type="button" variant={on ? "default" : "outline"} title={b.name} aria-label={b.name} className={cn("h-9 px-2 md:h-8", b.logo_url ? "w-16 justify-center" : "text-sm md:text-xs")} onClick={() => { setBrand(b.name); requestAnimationFrame(() => sizeRef.current?.focus()); }}>
                          {b.logo_url ? (
                            <span className={cn("flex h-6 w-12 items-center justify-center overflow-hidden rounded bg-white", on && "ring-2 ring-primary-foreground/60")}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={b.logo_url} alt={b.name} className="max-h-5 max-w-10 object-contain" />
                            </span>
                          ) : (
                            b.name
                          )}
                        </Button>
                      );
                    })}
                    {quickBrands.length > 10 && (
                      <Button type="button" size="sm" variant="ghost" className="h-9 px-2 text-sm text-muted-foreground md:h-7 md:text-xs" onClick={() => setMoreBrands((m) => !m)}>{moreBrands ? "Fewer brands" : "More brands…"}</Button>
                    )}
                  </div>
                )}
                <datalist id="brands">{brandHits.map((b) => <option key={b.name} value={b.name}>{tierLabel(b.tier)}</option>)}</datalist>
              </Field>
              {!rejected && (
                <div className={cn("grid min-w-0 content-start gap-2 rounded-md border p-3 sm:col-span-2", rareFind && "border-amber-500 bg-amber-50 dark:bg-amber-950/40")}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant={rareFind ? "default" : "outline"} className="h-10" onClick={() => setRareFind((r) => !r)}>★ Rare find{rareFind ? " · on" : ""}</Button>
                    <span className="text-xs text-muted-foreground">{rareFind ? "Prints a Rare Find band on the tag with the reason, and tags it for the Shopify Rare Finds collection. If the QC head gave a price, set it by hand under Condition." : "Decided at grading — tap only if this piece came from the rare basket."}</span>
                  </div>
                  {rareFind && (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {ref.rare_reasons.map((w) => (
                          <Button key={w.code} type="button" size="sm" variant={rareWhy[0] === w.code ? "secondary" : "outline"} title={w.tag} className="h-9 px-3 text-sm md:h-7 md:px-2.5 md:text-xs" onClick={() => setRareWhy([w.code])}>{w.label}</Button>
                        ))}
                      </div>
                      <Input value={rareText} onChange={(e) => setRareText(e.target.value)} maxLength={80} placeholder="Optional detail — e.g. 1990s Levi's 501, made in USA" />
                      {rareChosen ? (
                        <div className="grid gap-1 rounded-md border bg-background p-2 text-xs">
                          <div><span className="text-muted-foreground">On the tag: </span><span className="font-medium">{rareLine}</span></div>
                          <div><span className="text-muted-foreground">On Shopify: </span>{rareChosen.web}{rareText.trim() ? ` ${rareText.trim()}` : ""}</div>
                          <div className="text-muted-foreground">Managers can reword these under Pricing → Rare finds.</div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Choose the one reason — its short line prints on the tag and its full text goes on the online listing.</p>
                      )}
                    </>
                  )}
                </div>
              )}
              <div className="grid min-w-0 content-start gap-1.5 sm:col-span-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Label>Size on label {size && <span className="font-normal text-muted-foreground">· {size}</span>}</Label>
                  <div className="flex gap-1 rounded-md border p-0.5">
                    {sizeSeries.map((s) => (
                      <Button key={s.code} type="button" size="sm" variant={s.code === activeSeries.code && !sizeOther ? "secondary" : "ghost"} className="h-7 px-2.5 text-xs" onClick={() => { setSizeSeriesCode(s.code); setSizeOther(false); }}>{s.label}</Button>
                    ))}
                    <Button type="button" size="sm" variant={sizeOther ? "secondary" : "ghost"} className="h-7 px-2.5 text-xs" onClick={() => { setSizeOther(true); requestAnimationFrame(() => sizeRef.current?.focus()); }}>Other…</Button>
                  </div>
                </div>
                {!sizeOther ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activeSeries.sizes.map((s) => (
                      <Button key={s} type="button" size="sm" variant={size.trim().toLowerCase() === s.toLowerCase() ? "default" : "outline"} className="h-11 min-w-12 px-3 text-base md:h-8 md:min-w-10 md:px-2.5 md:text-sm" onClick={() => setSize(s)}>{s}</Button>
                    ))}
                    <Button type="button" size="sm" variant="ghost" title={`Add a size to the ${activeSeries.label} row`} className="h-11 w-11 px-0 text-xl text-muted-foreground md:h-8 md:w-8 md:text-base" onClick={() => addSizeLabel(activeSeries.code)}>+</Button>
                  </div>
                ) : (
                  <>
                    <Input ref={sizeRef} list="sizes" value={size} onChange={(e) => setSize(e.target.value)} placeholder={isKids ? "e.g. 4–5 Y or 4T" : "Copy the label, e.g. 34x32 or One size"} autoComplete="off" />
                    <datalist id="sizes">
                      {(isKids ? KIDS_SIZES.map((k) => k.label) : ADULT_SIZES).map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </>
                )}
                {isKids && size && <p className="text-xs text-muted-foreground">{kidsHint(size)}</p>}
              </div>
              {!outlet && (<Field label="Colour">
                <Input list="colours" value={colour} onChange={(e) => setColour(e.target.value)} placeholder="e.g. Black" autoComplete="off" />
                <datalist id="colours">{COLOURS.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>)}
            </div>

            <ButtonGroup
              label="Condition"
              hint="Tags → BNWT · fabric used → Very Good · stain or repair → Excellent · else Premium. When in doubt, grade up."
              options={ref.grades.map((g) => ({ code: g.code, label: GRADE_LABELS[g.code] ?? g.name, sub: g.code === "rejected" ? "Rs 0" : channel === "outlet" && GRADE_RANK[g.code] < GRADE_RANK[ref.outlet_min_grade] ? "Not for outlets" : price?.grade_prices?.[g.code] != null && !needsManual ? pkr(price.grade_prices[g.code]) : undefined }))}
              value={grade}
              onChange={setGrade}
            />
            {belowOutletMin && (
              <div className="rounded-xl border-4 border-sky-500 bg-sky-50 p-4 text-center dark:bg-sky-950/40" role="alert">
                <div className="text-4xl">🛑</div>
                <p className="mt-1 text-lg font-bold">{GRADE_LABELS[grade]} does not go to the outlets</p>
                <p className="mt-1 text-sm text-muted-foreground">Outlets take {GRADE_LABELS[ref.outlet_min_grade]} and above. Do not tag this garment here — put it on the Very Good pile; it is tagged later under the Online store channel. Pick another condition only if you graded it wrong.</p>
                {confirmOverride ? (
                  <div className="mt-4 rounded-lg border-2 border-red-500 bg-background p-3">
                    <p className="text-sm font-semibold">Are you sure? This {GRADE_LABELS[grade]} garment will be tagged for an outlet and can go on a transfer.</p>
                    <p className="mt-1 text-xs text-muted-foreground">The override is recorded on the garment under your name.</p>
                    <div className="mt-3 flex justify-center gap-2">
                      <Button type="button" variant="outline" onClick={() => setConfirmOverride(false)}>No, keep it off the outlets</Button>
                      <Button type="button" variant="destructive" onClick={() => { setOutletOverride(true); setConfirmOverride(false); }}>Yes, send it to the outlet</Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setConfirmOverride(true)}>Send it to the outlet anyway…</Button>
                )}
              </div>
            )}
            {outletOverride && channel === "outlet" && !rejected && ref != null && GRADE_RANK[grade] < GRADE_RANK[ref.outlet_min_grade] && (
              <p className="rounded-md border border-red-400 bg-red-50 px-3 py-2 text-sm dark:bg-red-950/40" role="status">
                <span className="font-semibold">Outlet override on</span> — this {GRADE_LABELS[grade]} garment will be tagged for an outlet. <button type="button" className="underline" onClick={() => setOutletOverride(false)}>Undo</button>
              </p>
            )}

            {!rejected && (
              <div className="grid gap-2">
                {!blocked && (
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={manualOn} onCheckedChange={(v) => { setManualOn(v === true); if (v !== true) setManualPrice(""); }} /> Set the price by hand <span className="text-muted-foreground">· exceptional piece; anything below the sheet is logged</span></label>
                )}


            {rejected && (
              <Note tone="warn">Rejected — price 0. Still saved as an item so the reject rate is measured. Pull buttons and snaps, cut drawstrings, then bin it.</Note>
            )}


            {selectedSub && !outlet && (
              <div className="space-y-3">
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


                {needsManual && (
                  <Field label="Manual price (Rs)" hint={blocked ? price?.block_reason : standardPrice ? `Pricing sheet says Rs ${standardPrice.toLocaleString()} at this grade` : undefined} hintTone={blocked ? "warn" : undefined}>
                    <Input type="number" inputMode="numeric" min="1" step="1" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} className="max-w-xs" autoFocus />
                  </Field>
                )}
                {below && (
                  <Field label={`Why ${belowPct}% below the pricing sheet? · required, logged`} hintTone="warn" hint={`Sheet price Rs ${standardPrice!.toLocaleString()} → yours Rs ${listPrice.toLocaleString()}. Managers see this on the dashboard.`}>
                    <Input value={belowReason} onChange={(e) => setBelowReason(e.target.value)} placeholder="e.g. faded print not covered by grade" className="border-amber-500" />
                  </Field>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------------------------------- price */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:border-t max-lg:bg-background max-lg:p-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              Price
              {pricing && <span className="text-xs font-normal text-muted-foreground">updating…</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {price?.error && <Note tone="error">{price.error}</Note>}
            {blocked && !listPrice ? (
              <Note tone="warn">{price?.block_reason} Set the price by hand.</Note>
            ) : (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Our price · incl. tax</div>
                <div className="text-2xl font-bold tabular-nums">{listPrice ? pkr(listPrice) : "—"}</div>
              </div>
            )}

            {price?.cost_basis === "planning" && (
              <Note tone="warn">No standard cost set for this sub-category yet — ask a manager to set it under Pricing.</Note>
            )}

            {price && !price.restricted && price.markdowns?.length ? (
              <dl className="space-y-0.5 border-t pt-2 text-xs">
                {price.markdowns.map((m) => (
                  <div key={m.stage} className="flex justify-between">
                    <dt className="text-muted-foreground">{MARKDOWN_LABELS[m.stage] ?? m.stage}</dt>
                    <dd className="tabular-nums">{pkr(m.price)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {price && !price.restricted && (
              <dl className="space-y-0.5 border-t pt-2 text-xs">
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
                    <dt className="text-muted-foreground">Margin after markdowns</dt>
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
                  Saved <span className="font-mono font-semibold">{saved.sku}</span>{` · ${pkr(saved.list_price)}`}
                </Note>
                {photoError && (
                  <Note tone="warn">Garment saved, but the photo didn&apos;t upload ({photoError}). <button type="button" className="underline" onClick={() => photo && uploadPhoto(saved.sku, photo.blob).then(() => setPhotoError(null)).catch((e) => setPhotoError(e.message))}>Retry</button></Note>
                )}
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
            {outlet && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => photoRef.current?.click()} className={cn("flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-dashed", photo ? "border-transparent" : "border-amber-500")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {photo ? <img src={photo.url} alt="garment" className="size-full object-cover" /> : <Camera className="size-5 text-muted-foreground" />}
              </button>
              <div className="grid min-w-0 gap-1">
                <Button type="button" variant={photo ? "outline" : "default"} className="h-10 w-fit" onClick={() => photoRef.current?.click()}><Camera className="size-4" /> {photo ? "Retake photo" : "Take photo"}</Button>
                <p className="text-[11px] leading-tight text-muted-foreground">{photo ? "Saved with the garment." : "Reference shot, required · last step before Save"}</p>
              </div>
            </div>
            )}
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
  "flex h-11 md:h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-transparent px-3 py-1 text-base md:text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const COLOURS = ["Black", "White", "Grey", "Navy", "Blue", "Red", "Green", "Beige", "Brown", "Pink", "Yellow", "Orange", "Purple", "Multi"];

function tierLabel(tier: string) {
  return { regular: "Regular high street", affordable_luxury: "Affordable luxury", ultra_luxury: "Ultra luxury" }[tier] ?? tier;
}

function kidsHint(size: string) {
  const hit = KIDS_SIZES.find((k) => k.label.toLowerCase() === size.trim().toLowerCase());
  return hit ? `${hit.heightCm} cm · measure ${hit.measure}` : "Copy the label exactly; the height range is added beside it";
}

function Field({ label, hint, hintTone, small, children }: { label: string; hint?: string; hintTone?: "warn"; small?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
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

function ButtonGroup<T extends string>({ label, hint, options, value, onChange }: { label: string; hint?: string; options: { code: T; label: string; sub?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button key={o.code} type="button" size="sm" variant={o.code === value ? "default" : "outline"} onClick={() => onChange(o.code)} className={cn("px-4 text-sm md:px-3 md:text-xs", o.sub ? "h-14 flex-col gap-0 md:h-12" : "h-11 md:h-8")}>
            <span>{o.label}</span>
            {o.sub && <span className={cn("text-[11px] font-normal tabular-nums", o.code === value ? "opacity-80" : "text-muted-foreground")}>{o.sub}</span>}
          </Button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
