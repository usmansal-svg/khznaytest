# Khazanay Tagging System — Reference

*Everything built between 7 and 10 September 2026. The system of record for how the tagging platform works, why it works that way, and what is still open. Keep this current when things change.*

**Live:** https://khazanaytest.vercel.app · **Repo branch:** `pricing-engine` (48 commits) · **Database:** Supabase project `dytirapyaaadjobklree` · **Tests:** 101, all passing (`npm test`)

---

## 1. What this is

A tagging platform for Khazanay's thrift clothing business: bales are bought (by kg or by the piece), sorted and graded, priced, tagged with a barcode, photographed, and shipped to one of five outlets. Everything a garment is — grade, price, photo, lot, who tagged it, where it went — is one record in one `items` table, which later modules (POS, Shopify, reports) read from. Nothing forks that inventory.

Two channels share the same form and table: **outlet** (quick tag, print, ship) and **online** (photos, background removal, Shopify). The online side is built but parked until the offline system is perfect.

---

## 2. People and roles

Sign-in is **name + PIN** on a shared iPad (no email accounts). The first person to open a fresh install becomes founder.

| Role | Sees and does |
|---|---|
| **Founder** (Usman) | Everything |
| **Manager** (supervisor) | Dashboard, lots and costs, splits, transfers, QC, pricing sheet, brands, staff, exports |
| **QC senior** | Tag, items, transfers, QC (regrade, price rare pieces) |
| **Tagger** | Tag item and item lookup only; lands on the tag screen |

Enforced three times: the proxy (route gating), the sidebar (what shows), and every API (server check). Taggers get a stripped `/api/price` — no cost, margin, expected revenue, multiple or markdown ladder — so the restriction holds at the network, not just on screen.

Managers add taggers at **Admin → Staff** (name, role, home outlet, PIN, daily target). PINs are scrypt-hashed; five wrong PINs lock a name for a minute; sessions are HMAC-signed cookies valid 12 hours.

---

## 3. Screens

| Screen | Path | Who | Purpose |
|---|---|---|---|
| Sign in | `/login` | all | Name grid + keypad; first run sets up the founder |
| **Tag item** | `/tag` | tagger+ | The one screen that must be fast (§5) |
| Items | `/items` | tagger+ | Search by SKU / brand / sub-category; reprint; Excel/CSV export with a date range (managers) |
| Garment | `/items/[sku]` | tagger+ | Channel, destination outlet, photos, listing preview, Shopify push |
| Print tag | `/items/[sku]/print` · `/print?skus=…` | tagger+ | One tag, or a whole session's tags in one print job |
| Transfers | `/transfers` | QC senior+ | Ship garments to an outlet (§7) |
| QC | `/qc` | QC senior+ | Blind regrading of held garments; price rare pieces (§8) |
| Lots | `/lots` | manager+ | Purchases, splits, P&L (§6) |
| Dashboard | `/dashboard` | manager+ | The founder's view (§10) |
| Pricing | `/admin/pricing` | manager+ | Constants, markdown ladder, selling profiles, grades, sub-categories, history (§4) |
| Brands | `/admin/brands` | manager+ | Three tier columns; new-from-tagger tray |
| Staff | `/admin/staff` | manager+ | Names, roles, PINs, targets |

Removed from this platform's sidebar (code kept for the POS): the Till (`/pos`) and the Floor screen (drop day / monthly sweep). The public pricing demo at `/price` remains open and should be closed before real stock.

---

## 4. The pricing model

### 4.1 Where a price comes from

Every sub-category on the pricing sheet carries a **cost per piece (Rs)** — what one garment costs **before sales tax, with import duty already included**. The engine adds the non-recoverable share of input tax; it adds no duty. From it:

```
landed   = cost_per_piece × (1 + input_tax_rate × (1 − input_tax_recover)) + sorting_per_piece
           (cost entered before sales tax; local-market lots add no tax)
loaded   = landed × (1 − b × (1 − target_gp)) / k        ← every constant and profile loss, as a cost
           k = (1 − D) × grade_sum × (1 − rejected − pulled)   the sell-through factor
           b = (pulled + rejected) × bulk_recovery
premium  = charm( loaded / (1 − target_gp) × (1 + sales_tax) × value_index × brand_multiplier × (1 + adjust_pct/100) )
           (identical to landed × profile_multiple × …; the sheet shows both Landed and Loaded)
grade    = charm( premium × grade_multiplier )          (from the rounded premium)
markdown = charm( price × (1 − depth) )                 (25 / 50 / 75 %, from the rounded price)
charm(x) = max(190, round((x − 90) / 100) × 100 + 90)  → every price ends in 90
```

**A market price on the sheet replaces the calculated Premium** (rounded); the other grades follow it. Brand tier and the tagger's ± steps still apply on top.

**Why cost per piece, not weight:** vendors charge from $5/kg to $10/kg for the same garment, and the customer must see one shelf price for a Nike sports shirt. So the *shelf price* comes from a standard cost per sub-category; what was *actually* paid lives on the lot and shows up as margin in the lot P&L. Weighing was removed from the tag form on 10 Sep.

**Two margins.** *Effective GP* (the sheet's column, and the tag form's "margin after markdowns") is the real margin per garment bought: revenue after markdowns, grade mix, never-sells and rejects plus bulk recovery, ex tax, against landed cost. At the unrounded engine price it equals the target GP exactly; rounding, the value index and brand tier move it. The single-garment full-price margin is shown only as a tooltip, because it always reads far above target and misleads.

### 4.2 The multiple (per selling profile)

```
sellable   = 1 − rejected
gsum       = Σ grade_share / sellable × grade_multiplier      (sellable grades)
full_share = 1 − rejected − pulled
D          = Σ ladder_depth × volume
multiple   = (1/(1 − target_gp) − (pulled + rejected) × bulk_recovery) / ((1 − D) × gsum × full_share) × (1 + sales_tax)
```

Defaults give **Fast 3.3947 · Standard 3.9640 · Slow 4.5766**. Recomputed live from whatever the sheet says; never stored.

### 4.3 What is editable, and where

| Pricing tab | Fields |
|---|---|
| Constants | fx, planning rate, default provisional yield, duty/kg, sorting/piece, input tax rate and recoverable share, sales tax, target GP, rejected share, bulk recovery, rounding step/ending/minimum, high-value threshold, daily target, QC hold-back rate |
| Markdown ladder | Markdown 1 / 2 / Final depths (validated ascending) |
| Selling profiles | Never sells, full, 25%, 50%, 75% shares per profile (must sum to 100%) — multiples shown |
| Grades | Multiplier and intake share per grade (Premium fixed at 1.00, Rejected at 0) |
| Sub-categories | Cost per piece (before sales tax, duty included), profile, value index → landed, **loaded**, BNWT/Premium/Excellent/Very Good, **effective GP%** (live while typing); market ceiling; market price → Premium; add categories and sub-categories |
| History | Settings versions with who saved them; every audited change (who, when, before → after) |

**Excel round trip (10 Sep).** *Export Excel* at the top of the Pricing screen downloads one workbook with four sheets — Constants, Selling profiles, Grades, Sub-categories — editable cells in yellow, calc columns for reference, and a How-to sheet. Edit in bulk, then *Import Excel*: the server lists every difference (sheet, row, field, now → after) and refuses the file with readable problems if a value is out of range or the shares do not add to 100%. *Apply* writes through the same endpoints as the screen, so constants become a new settings version noted with the file name and every other edit is audited. Keys, codes and slugs are the row match; unknown rows are ignored.

Every settings save is a new **version**; items keep the version they were priced under. Every edit writes an audit row with the staff name.

### 4.4 Grades

BNWT ×1.80 · Premium ×1.00 · Excellent ×0.85 · Very Good ×0.60 · **Rejected** price 0 (still saved, so the reject rate is measured). Ask in order: tags on → BNWT; fabric visibly used → Very Good; stain or repair → Excellent; else Premium. *When in doubt, grade up* — downgrading is the silent, costly error.

### 4.5 Brand tiers

Regular high street ×1.00 · Affordable luxury ×2.00 · Ultra luxury → handed off to a senior to price. Tier is never judged by the tagger.

---

## 5. The tag form — how a garment is tagged

Order on screen, all on one iPad page:

1. **Tagging for** Outlet / Online, with a **Lock** · **Lot**, with a **Lock** — set once, tag garment after garment
2. Season (Summer/Winter) · Wearer (Men, Women, Boy, Girl, Infant, Unisex)
3. **Find a garment type** (type "crop" → *Crop top*), or Category → Sub-category (categories are per gender: Tops & Blouses, Dresses & Jumpsuits, Jeans, …)
4. **Photo — compulsory** (opens the iPad camera; downscaled on device)
5. **Brand** — misspellings snap to the listed brand offline (*calvin klien* → Calvin Klein); a brand nobody has listed is cleaned up and **added to the Brands tab as High street** at save, marked *new from tagger*
6. Size on label (kids age bands with height hints) · Colour
7. **Condition** — five buttons, each showing its price
8. **Rare find** — hands the garment off (§8.2)
9. Sleeves (half / full / sleeveless) on shirts, T-shirts, sports tops, outerwear — required
10. Measured flat, in inches, per garment type (chest & length · waist & length · bust, waist, length · chest, length, sleeve)
11. **Price adjustment** — a ± stepper in 5% blocks (−50% to +100%)
12. *Set the price by hand* for exceptional pieces
13. **Save & print tag** — SKU allocated atomically (`KHZ-{season}{wearer}-{3-letter code}-{5 digits}`), photo uploaded, tag printed from the form via a hidden print frame (Auto-print on by default)

**Under-pricing is logged, never silent.** Every save records the sheet's standard price beside the final price. Any price below standard — by steps or by hand — requires a **reason** and writes a `price_alerts` row (tagger, SKU, sheet price, final, % below, reason). The dashboard lists them and counts them per tagger.

**QC hold-back.** After each save, a random share (QC rate, 10% default) is held: a full-screen notice tells the tagger to put it on the QC rail. Held garments cannot ship until a senior regrades and releases them.

Taggers see only the shelf price and the grade prices — no cost, margin or ladder.

---

## 6. Lots

A **lot** is a purchase. Numbers are issued in sequence (`LOT-0001`, …) and never reused.

- **Basis:** by weight (USD/kg, kg bought, provisional yield 0.90 until close) or per piece (Rs each, pieces bought)
- **Imported or Local market:** imported lots pay duty on weight and carry the reclaimable input-tax credit; local ones carry neither
- **Description** (what was bought) vs **Notes** (internal)
- **Split** into weighed or counted piles (`LOT-0001-A`, `-B`, …), each with its own description; the parent keeps the cost and can no longer be tagged from
- **Edit** any field; **Close** with true-up (kg tagged) — garments already tagged keep their price; **Delete** asks twice and is refused while anything references the lot

**Lot P&L:** pieces, % done, rejects vs 3%, cost tagged (standard) against **actual cost per piece** (lot cost ÷ pieces) with the variance, expected revenue, expected GP, and **GP per piece** — the number to compare lots on.

---

## 7. Transfers (destination is decided by the supervisor)

The tagger never chooses an outlet. A supervisor opens a transfer to an outlet, **scans tags onto it**, prints an A4 sheet with a barcode per line, marks it **sent**, and the outlet marks it **received** — which sets each garment's outlet and received time. Held-for-QC and set-aside garments are refused. The dashboard shows every shipment with created / dispatched / received times and transit hours.

Outlets: Karachi 1, Karachi 2, Islamabad, Lahore 1, Lahore 2, plus Online (rename to area names when ready).

---

## 8. QC

### 8.1 Random hold-back (the main control)
Chosen at save, after the tagger has committed, so it cannot be gamed. The senior opens **QC → Held for QC**, scans the tag, and grades **blind** — the tagger's grade is revealed only after choosing. The price the garment *should* have had is computed and the difference stored. The dashboard reports agreed / too low / too high per tagger and the rupees lost to downgrading. A photo-review mode (30 random per week) is available as an extra.

### 8.2 Rare finds
The tagger ticks **Rare find** (two or more triggers: special fabric, handwork, lined/tailored structure, vintage markings, occasion wear, matching set, statement piece, limited edition). Save prints a **hold tag** — no price — and the garment goes on the Set Aside rail. Ultra-luxury brands take the same route automatically. The senior prices it from **QC → Rare pieces** with the garment in hand, ticking the triggers and giving a reason; the real tag prints. Rare rate per tagger is watched against the spec's 3% cap.

---

## 9. "New in store" comparison prices

Built and seeded, then **retired on 10 Sep**: Usman will not print comparison prices, so the tag line, the Compare prices menu entry and the compare-at constants were all removed from view. The route `/admin/compare`, the `reference_prices` table and the lookup code remain in the repo; nothing reads them now.

Lookup order: brand × sub-category → brand × category → tier × sub-category → tier × category (the `reference_prices` table, managed at **Admin → Compare prices**) → the sub-category's market price → a **formula** (Premium × 3.0 high street, × 3.5 affordable luxury; switchable in Pricing → Control). Printed figures round down; a saving under 10% is never printed. 303 research estimates were seeded (lower-typical UK prices at Rs 376/£), all marked *estimate* until confirmed. A *needs a price* list is ordered by how often each brand × sub-category is tagged.

---

## 10. The dashboard (founder / manager)

Presets 7 / 30 / 90 days or a **custom date range**. Sections:

- **KPIs:** tagged today / this week / period, pieces per active hour today, list value, landed cost, expected GP and %, rejects vs 3%
- **Needs your attention:** under-priced garments, new brands to tier, missing photos, garments on the QC rail, rare pieces awaiting a price, lots nearly done, stock not yet on a transfer
- **Tagger performance:** tagged, today vs target, per day, median seconds per garment, QC agreement (with the too-low count), Premium+ share, rejects, average adjustment, under-priced, by-hand prices, rare %, missing photos, value, last active
- Tagged per day · grade mix vs assumed · open-lot progress · what's being tagged (by gender and category)
- **Grading accuracy** from QC regrades · **Priced below the sheet** · stock by outlet and colour · shipments · latest tagged · **Export** (items with date range, shipments, lots — Excel or CSV)

---

## 11. The printed tag

50 × 90 mm, **single-sided**, one page per garment, printed from the tag form (AirPrint / label printer at 100% scale, no margins):

Khazanay wordmark · unmarked space top-right for the month's **colour sticker** · **brand** and garment type · **Size** large · **Price** 24-pt bold · unmarked 42 × 10 mm space for the **markdown sticker** · Code 128 **barcode** and **SKU**. No condition, cost, outlet, tax line, measurements or comparison price. A rare find prints *RARE FIND — set aside, to be priced by a senior* in place of the price.

---

## 12. Online channel (parked)

Garment page: channel switch, photos (camera capture, on-device background removal via `@imgly/background-removal`, composited onto white, stored in the public `garments` bucket), automatic Shopify collection tags (`Men`, `Heavy Hoodie`, `Men Heavy Hoodie`, brand, `Size L`, grade, colour, …), **Send to Shopify** (one product per garment, single variant, quantity 1) and **Unlist**. Needs `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_ACCESS_TOKEN` in Vercel; not yet set.

---

## 13. Technical reference

**Stack:** Next.js 16 (App Router, cache components), React 19, TypeScript, Tailwind + shadcn/ui, Supabase (Postgres, Storage), Vercel. Node 24 runs the tests natively (`node --test`, no framework).

**Key code:**
- `lib/pricing/engine.ts` — the pure pricing chain; `engine.test.ts` pins both spec verification tables
- `lib/pricing/quote.ts` — the price quote used by `/api/price` and item save
- `lib/pricing/repo.ts` — loads settings, grades, profiles, sub-categories, lots from the database
- `lib/pricing/sheet.ts` — the Pricing tab as an Excel workbook and back (`sheet.test.ts` round-trips it)
- `lib/pricing/compare.ts` — comparison price lookup · `lib/pricing/lot-pnl.ts` · `lib/pricing/floor.ts` (POS later)
- `lib/brands/normalise.ts` — brand cleanup and fuzzy match · `lib/barcode/code128.ts` — barcode SVG · `lib/shopify/*`
- `lib/auth/*` — PIN hashing, signed sessions, `requireStaff` / `requireManager`
- `lib/supabase/proxy.ts` — route gating by session and role

**API (all under `/api`):** `price`, `items`, `items/[sku]`, `reference`, `brands`, `lots`, `transfers`, `qc`, `photos`, `tags/[sku]/barcode`, `export`, `dashboard`, `auth/*`, `admin/{settings,profiles,grades,sub-categories,categories,brands,staff,reference-prices,pricing/sheet}`, `shopify/push`.

**Migrations (25, all applied):** `pricing_schema` · `pricing_seed` (generated from code by `test/gen-seed.ts`) · `sub_category_codes` · `tagging_support` · `lots_and_weights` · `channels_photos_shopify` · `staff_pins_transfers` · `transfer_seq` · `lot_split` · `lot_description_pieces` · `lot_imported_sequence` · `settings_changed_by` · `categories_flat_gender` · `categories_two_level` · `subcategory_planning_rates` · `price_steps_alerts` · `brands_source` · `qc_and_targets` · `qc_hold` · `standard_cost` · `reference_prices` · `rare_handoff` — plus the health check and two POS migrations from a parallel session.

**Environment (Vercel + `.env.local`):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only; also signs sessions), optional `SESSION_SECRET`, `SHOPIFY_*`.

**Operating it:** `npm run build` · `npm test` · `npx supabase db push --yes` (migrations) · `npx vercel --prod --yes` (deploy). GitHub → Vercel auto-deploy is connected for previews on push; production deploys come from the CLI while work is on `pricing-engine`. Claude's allow rules live in `.claude/settings.local.json`.

---

## 14. Decisions worth remembering

- **Markdowns round** (25/50/75 → 1,390 / 890 / 490 on a 1,790 shirt); the original spec's floor example was an error, corrected by spec v2.
- **Standard cost per sub-category, not scale weight**, sets the shelf price (10 Sep). Weight-based pricing remains in the engine for lot P&L.
- **Costs are entered before sales tax, duty included.** Some vendors charge tax and local-market ones do not, so the engine adds the non-recoverable input tax itself (never on local lots). Duty per kg applies only to kg lots; adding it to per-piece costs was tried and reverted the same day.
- **Lot numbers never reuse** a deleted number (tried and reverted the same day).
- **Two-level catalogue per gender** (Category → Sub-category) with type-to-find, after trying flat.
- **QC by random hold-back at tagging**, not at the outlet or by shipment sample.
- **Rare pieces are handed off**, never priced by the tagger.
- **Cost data is hidden from taggers at the API**, not just the UI.
- **Fuzzy brand matching skips 4-letter names** (*Zora* is not corrected to *Zara*) — deliberate.

---

## 15. Open items

**Yours to do**
- Overwrite *Cost per piece* on the sheet with real purchase costs (seeded values are ~11% high — they were landed costs)
- Revert two test edits still on the live sheet: *Men Button-down shirt* weight 0.01 (was 0.30) and input tax 5% (spec says 18%) — or confirm them
- Confirm or correct the 303 research comparison prices when/if they go on tags or online
- Rename outlets to area names; add Compression Wear and Waistcoat sub-categories
- Delete the three spec-verification lots (`LOT-B-01-S`, `-W`, `LOT-A-01`) and the two POS demo items once real stock arrives
- Choose a scale (Bluetooth keyboard output) and a station label printer — the two hardware changes that cut the most seconds

**Before real stock — security**
- Remove the last temporary bypasses: `/price` and `/pos` in `lib/supabase/proxy.ts`, and the `temp_anon_read` policies (migrations `20260907220000` and `20260908090100`)

**Next phase**
- POS platform (separate software) reading `items`; sell-through by grade and profile lights up from `sold_stage`
- Shopify orders webhook (an online sale marks the item sold)
- Stock counts per outlet; drop day / monthly sweep move to the POS
- Merge `pricing-engine` into `main` so production auto-deploys

---

*Last updated 10 September 2026, commit `b9ecbe7`.*
