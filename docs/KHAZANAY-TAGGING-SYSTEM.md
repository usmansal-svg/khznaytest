# Khazanay Tagging System — Reference

*Everything built from 7 September 2026. This is the tagging platform only: the POS built on 12 September was moved out of the app into `archive/pos/` (with its own reference document) to become separate software. The system of record for how the tagging platform works, why it works that way, and what is still open. Keep this current when things change.*

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
| **Photographer** | The Photos station only; lands there and is redirected from everything else. Cannot tag. |

Enforced three times: the proxy (route gating), the sidebar (what shows), and every API (server check). Taggers get a stripped `/api/price` — no cost, margin, expected revenue, multiple or markdown ladder — so the restriction holds at the network, not just on screen.

Managers add staff at **Admin → Staff** (name, role, home outlet, PIN, daily target — garments tagged for a tagger, garments photographed for a photographer). PINs are scrypt-hashed; five wrong PINs lock a name for a minute; sessions are HMAC-signed cookies valid 12 hours.

---

## 3. Screens

| Screen | Path | Who | Purpose |
|---|---|---|---|
| Sign in | `/login` | all | Name grid + keypad; first run sets up the founder |
| **Tag item** | `/tag` | tagger+ | The one screen that must be fast (§5) |
| Photos | `/photos` · `/photos/[sku]` | tagger+, photographer | Photography station: scan-and-shoot on the iPhone, review per garment |
| Items | `/items` | tagger+ | Garments tagged in a date window (this month by default; a search looks across all time), up to 5,000 in the browser with the true count shown; Lot, Brand, Item, Grade, Size, **Station**, Channel, Shopify, Price; Excel-style filters on every column; 50 / 100 / 200 per page; tick boxes with Select all; managers export the ticked rows or all shown to Excel, or every garment in the date range straight from the database (no cap, no CSV), and upload ticked garments to Shopify with a POS only / Website + POS / Website only / Draft switch |
| Garment | `/items/[sku]` | tagger+ | Channel, destination outlet, photos, listing preview, Shopify push |
| Print tag | `/items/[sku]/print` · `/print?skus=…` | tagger+ | One tag, or a whole session's tags in one print job |
| Transfers | `/transfers` | QC senior+, outlet manager | Pack → dispatch → receive (scan-check) → reconcile (§7) |
| Floor stock | `/floor` | QC senior+, outlet manager | Stockroom to floor by scan; colour, sweep, pull (§7) |
| QC | `/qc` | QC senior+ | Review held garments: approve or correct the tagging (§8) |
| Scorecard | `/admin/scorecard` | manager+ | Daily targets per person, and the monthly KPIs for everyone: taggers, photographers, QC reviewers; finalise scores (§8.1) |
| Lots | `/lots` | manager+ | Read-only: lot number, description, quantity, tagged so far (§6). Purchasing lives in the commercial software |
| Dashboard | `/dashboard` | manager+ | The founder's view (§10) |
| Catalogue | `/admin/catalogue` | manager+ | The catalogue as a tree, gender → category → sub-category, each node showing the Shopify tag it produces (`Men`, `Men Shirts`, `Men Formal Shirt`); add, rename, delete, hand-set tag, season (summer / winter / all — decides which tag form offers it; moved here from Pricing 13 Sep), girls- or boys-only for child bands (delete only when nothing references it). New sub-categories copy cost, weight, profile and value index from a sibling. Added 12 Sep for the website menu; seeded the same day to the tree in `docs/SHOPIFY-CATALOGUE.md` (Men 13 categories, Women 17, Kids 8; the old Heavy/Light and Men/Women-prefixed names switched off or renamed) |
| Pricing | `/admin/pricing` | manager+ | Numbers only since 13 Sep — categories and sub-categories are created on the Catalogue screen (one shared list; both screens edit the same tables). | Constants, markdown ladder, selling profiles, grades, sub-categories, history (§4) |
| Brands | `/admin/brands` | manager+ | Quick-pick list for the tag form; three tier columns; new-from-tagger tray |
| Settings | `/admin/settings` | manager+ | Tabs: **Staff** (names, roles, PINs, home outlet), **Outlets** (names, cities, add, switch off), **Shopify** (connection, outlet → Shopify location, order webhook), **System** (live connection checks; also public at `/health`). Daily targets moved to the Scorecard (12 Sep) |

The public pricing demo at `/price` remains open and should be closed before real stock.

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
| Constants | fx, planning rate, default provisional yield, duty/kg, sorting/piece, input tax rate and recoverable share, sales tax, target GP, rejected share, bulk recovery, rounding step/ending/minimum, high-value threshold, daily target, QC hold-back rate, lowest condition for outlets |
| Markdown ladder | Markdown 1 / 2 / Final depths (validated ascending) |
| Selling profiles | Never sells, full, 25%, 50%, 75% shares per profile (must sum to 100%) — multiples shown |
| Grades | Multiplier and intake share per grade (Premium fixed at 1.00, Rejected at 0) |
| Sub-categories | Season (summer / winter / all year), cost per piece (before sales tax, duty included), profile, value index → landed, **loaded**, BNWT/Premium/Excellent/Very Good, **effective GP%** (live while typing); market ceiling; market price → Premium; add categories and sub-categories |
| Rare finds | Label, tag line and web text per reason; switch a reason off; add new reasons |
| History | Settings versions with who saved them; every audited change (who, when, before → after) |

**Excel round trip (10 Sep).** *Export Excel* at the top of the Pricing screen downloads one workbook with four sheets — Constants, Selling profiles, Grades, Sub-categories — editable cells in yellow, calc columns for reference, and a How-to sheet. Edit in bulk, then *Import Excel*: the server lists every difference (sheet, row, field, now → after) and refuses the file with readable problems if a value is out of range or the shares do not add to 100%. *Apply* writes through the same endpoints as the screen, so constants become a new settings version noted with the file name and every other edit is audited. Keys, codes and slugs are the row match; unknown rows are ignored.

Every settings save is a new **version**; items keep the version they were priced under. Every edit writes an audit row with the staff name.

### 4.4 Grades

BNWT ×1.80 · Premium ×1.00 · Excellent ×0.85 · Very Good ×0.60 · **Rejected** price 0 (still saved, so the reject rate is measured). Ask in order: tags on → BNWT; fabric visibly used → Very Good; stain or repair → Excellent; else Premium. *When in doubt, grade up* — downgrading is the silent, costly error.

### 4.5 Brand tiers

Regular high street ×1.00 · Affordable luxury ×2.00 · Ultra luxury → handed off to a senior to price. Tier is never judged by the tagger.

---

## 5. The tag form — how a garment is tagged

**Two forms, one screen (11 Sep).** *Tagging for* switches the form. **Outlet** is the short form: season, wearer, category and sub-category as tap buttons (they set the price and the SKU), reference photo, brand, size, condition, price. Colour, measurements and sleeves are not asked. **Online** is the full form below, minus the photo: pictures are taken afterwards at the photography station (**Photos** in the menu, `/photos`), built for a professional photographer on an iPhone (11 Sep), laid out like the eBay / Vinted seller flow. **Home**: a dark header with the Khazanay wordmark (tap for home), a progress ring with today's percentage, the name, count against target and garments to go, plus profile (change own name or PIN with the current PIN, `PATCH /api/auth/profile`) and sign-out; one big *New garment · scan its tag* button, a search box for a retake (type or a reader), and the garment list (All / Pending / Done). **Shoot**: *Open camera* reads the tag's barcode through the phone camera, then the same camera becomes the shutter for that garment. Up to six shots. **Review** (*Review & adjust*, or tap a thumbnail): each picture full screen (swipe or arrows) with brightness and contrast sliders (− / + steps as well), rotate, *Apply to all pictures*, *Make cover*, *Retake this one* (discards it and returns to the shutter), *Discard*/*Keep*; adjustments are baked in on save. The order is the Shopify order and picture 1 is the **cover** (★ badge, cut out); press-and-hold a thumbnail and drag to reorder (the order is saved to the garment and is the Shopify order, earlier pictures included — `PATCH /api/photos`); each thumbnail has a *Delete* / *Keep* and *Make cover* bar and opens full screen on tap. A **reshoot** loads the garment's earlier pictures next to the new ones, marked *earlier*: each can be kept, adjusted (re-saved), discarded (deleted) or joined by new shots, up to six kept; a new cover replaces the old cut-out. *Save & next* returns to scanning at once while the work runs in the background — every kept shot centre-cropped square and sized for Shopify (2048 px, JPEG under 1 MB, never upscaled) and uploaded, and the first kept shot's background removed on the phone and placed on white with a soft feathered drop shadow. Uploads run silently; only a failure is shown. Below the camera, the full list of online garments — SKU, garment and size, brand, picture count (plus cut-outs), status (*None taken* highlighted, *Cut-out pending*, *Done*), and for QC seniors and above the photographer's name and time — with filters All / No pictures / Done, a *Shoot* button on garments without pictures and *Review* on the rest; the per-garment *Review* screen (`/photos/[sku]`) shows the pictures in order with the cover marked, a full view on tap (swipe between them) with *Adjust* (brightness, contrast, rotate, baked in on Apply and replacing the file in place), *Remove background* / *Redo* / *Undo* and *Delete* — once a picture has a cut-out, the cut-out is what the thumbnail and full view show (tap the banner to peek at the original); cut-outs record their source picture; *Delete* under each thumbnail, press-and-hold drag to reorder (saved at once), and *Add more pictures*, which opens the camera flow with the existing pictures loaded (`/photos?sku=…`). Background removal happens in the camera flow (on the cover) or from the full view here. The photographer's daily target (garments, set per person on Staff) shows at the top as a count and a percentage, as does the tagger's on the tag form. Works for a dedicated photographer or a tagger doing a photo session.

Order on the full (online) form:

1. **Tagging for** Outlet / Online, with a **Lock** · **Lot**, with a **Lock** — set once, tag garment after garment
2. **Season** (Summer/Winter, tap buttons) · Wearer (Men, Women, Boy, Girl, Infant, Unisex). Every sub-category carries a season on the pricing sheet — Summer, Winter or All year — and the form shows only that season's categories and sub-categories (no coats in summer, no shorts in winter). The season also goes into the SKU and into the Shopify tags, on its own and combined: *Summer*, *Summer T-Shirt*, *Summer Men T-Shirt*, so a collection can be built on season, wearer and type together.
3. **Category → Sub-category as tap buttons** (no keyboard, no picker wheel — fastest on the iPad; categories are per gender: Tops & Blouses, Dresses & Jumpsuits, Jeans, …). Both stay selected for the next garment, since taggers work through piles.
4. **Photo — compulsory** (opens the iPad camera; downscaled on device)
5. **Brand** — misspellings snap to the listed brand offline (*calvin klien* → Calvin Klein); a brand nobody has listed is cleaned up and **added to the Brands tab as High street** at save, marked *new from tagger*
6. **Size on label as buttons** — the series follows the garment: collar (14–18) for button-down shirts, waist (26–44) for bottoms, UK numbers for dresses, letters (XS–4XL) otherwise, age bands for kids; a small switch flips to the other series and *Other…* opens a text box for odd labels · **Brand as buttons with logos** — quick-pick lists **per category** (keyed by category name, so one *T-Shirts* list serves every gender), chosen and ordered by hand on the Brands page, with a general fallback list; up to twenty each, optional logo per brand (PNG/JPG/WebP on a 400×200 transparent canvas) shown above the name (first ten under Brand, next ten under *More brands…*); until any are chosen, the most-tagged brands of the last 90 days topped up from a fixed list; typing is for the rare ones · Colour (online only)
7. **Condition** — five buttons, each showing its price
8. **★ Rare find** button after Brand — decided at grading, before tagging; tap it and choose **one** reason (Brand · Vintage / year · Fabric quality · Design / style · Handwork · Limited edition · Made in Italy / Japan / USA, or any added later), with optional free text. Each reason carries two pieces of copy, editable under **Pricing → Rare finds** (the `rare_reasons` table): a one-line note for the outlet tag (about two lines) and a three-to-four-line paragraph for the online listing; the form previews both before saving. Priced as normal, or by hand at the price the QC head gave
9. Sleeves (half / full / sleeveless) on shirts, T-shirts, sports tops, outerwear — required
10. Measured flat, in inches, per garment type (chest & length · waist & length · bust, waist, length · chest, length, sleeve)
11. *Set the price by hand* sits directly under the Condition buttons, for exceptional pieces (the ±5% stepper was removed on 11 Sep)
13. **Save & print tag** — SKU allocated atomically (`KHZ-{season}{wearer}-{3-letter code}-{5 digits}`), photo uploaded, tag printed from the form via a hidden print frame (Auto-print on by default)

**Under-pricing is logged, never silent.** Every save records the sheet's standard price beside the final price. Any price below standard — by hand — requires a **reason** and writes a `price_alerts` row (tagger, SKU, sheet price, final, % below, reason). The dashboard lists them and counts them per tagger.

**Outlet minimum condition (11 Sep).** Outlets take only the better conditions: *Lowest condition for outlets* on the Constants tab, default **Excellent**. With Outlet selected, choosing a condition below it (Very Good by default) marks the button *Not for outlets*, blocks Save and tells the tagger to put the garment on the Very Good pile for online tagging later — no SKU, no price, no tag. The server refuses the save as well, and transfers refuse any such garment that slips through. A deliberate exception is possible: *Send it to the outlet anyway…* asks "Are you sure?" a second time, then unlocks Save; the override is stored on the garment (`items.outlet_override`) and audited under the tagger's name, and transfers honour it.

**QC hold-back.** After each save, a random share (QC rate, 10% default) is held: a full-screen notice tells the tagger to put it on the QC rail. Held garments cannot ship until a senior regrades and releases them.

Taggers see only the shelf price and the grade prices — no cost, margin or ladder.

---

**Station** (`lib/pricing/station.ts`) says where a garment is in the words the floor uses, and is the same on the Items screen and in the export. Online: *Tagging → Photography station → Packing station → Online shelf → Sold*. Outlet: *Tagging station → Packing · X → In transit · X → Receiving · X → Stockroom · X → On floor · X → Sold*, and *Missing · X* for a garment never scanned in at the outlet (§7). Either: *QC rail · Set aside · Pulled · Returned damaged · Rejected · Unlisted*.

**Light / Heavy (13 Sep).** Garments bought by the kilo differ in weight within one type, so a sub-category may carry a second **heavy cost** (Pricing → Categories, "Heavy cost Rs", also in the Excel sheet). When one is set, the tag form shows a *Weight: Light / Heavy* choice after Season; Heavy prices from the heavy cost and stores `weight_class = heavy` on the garment (QC re-pricing keeps it). The name, SKU and website menu tags do not change; Shopify gets an extra `Heavyweight` tag for filtering. The retired Heavy/Light pairs' costs were carried over: Light → cost per piece, Heavy → heavy cost, for hoodies, zip-ups, puffer, bomber and denim jackets, windbreakers and overcoats.

**Wearer (12 Sep list).** Men · Women · Unisex adult · Teen boy / Teen girl (9–14 years) · Kids boy / Kids girl (2–8 years) · Toddler boy / Toddler girl (12–24 months) · Infant boy / Infant girl (0–12 months). The wearer filters the category buttons to its age group, sets the SKU letter (M W U · T N · B G · D L · I J) and goes into the Shopify tags as *Kids Girls*, *Infant Boys*, … plus the band (*Teens*, *Kids*, *Toddlers*, *Infants*) and *Kids* for every child band, so collections can be built per wearer, per band, or for all children. Older values (boy, girl, infant, kid, toddler, teenage) stay valid on garments tagged before. The list lives in `lib/pricing/sku.ts`.

---

## 6. Lots (read-only here since 12 Sep)

A **lot** is a purchase, and purchasing is **commercial**: supplier, basis, rate, kg or pieces, duty and tax treatment, splits, closing with true-up and the lot P&L all moved to **Khazanay Commercials** (khazanay-commercials.vercel.app → Lots → *Record & manage*; the original code is kept in `archive/lots/` with the table contract). Both systems share one database; the commercial software **owns** `public.lots` and this app **reads** five columns only: `id`, `code`, `description`, `pieces` (quantity expected) and `status`. Financial columns are never selected.

In this app: **Lots** (`/lots`, manager+) lists each lot's number, description, quantity, garments tagged so far, rejects, progress and status. The tag form's lot picker offers the **open** lots as `LOT-0001 · description` with *n of pieces tagged*; a garment must be tagged against a lot (provenance), and the lot's code goes on the Items screen, the export and the dashboard's progress bars. Closing a lot is done in the commercial software; a closed or split lot is refused on the tag form.

**Pricing does not look at the lot.** The tag price comes from the sub-category's cost per piece (Pricing → Categories) and the constants; a sub-category with no cost per piece cannot be tagged until one is set (the old fall-back — scale weight at the lot's USD/kg rate — is retired). The commercial software can compute each lot's P&L from the `items` rows with that `lot_id` (count, grade mix, landed cost, price, sold price).

---

## 7. Transfers and flooring (changed 12 Sep)

The tagger never chooses an outlet. A supervisor packs a box for an outlet and the outlet checks it in garment by garment, so every transfer reconciles what was sent against what arrived. Four steps, each stamped with who and when:

| Step | Who | What happens | Station on Items |
|---|---|---|---|
| **Packing** | QC senior+ at the warehouse | *Start packing* opens a transfer to an outlet (`TRF-YYYYMMDD-0001`). Every tag is scanned into the box; held-for-QC, set-aside, online-channel, sold and below-minimum-grade garments are refused, as is a garment already on another open transfer. A garment can be scanned off again while packing. | *Packing · outlet* |
| **In transit** | same | *Dispatch* (with an optional box count and carrier / driver) closes the list; nothing can be added after. The A4 **packing list** carries a barcode per line, the dispatch details and a tick column. | *In transit · outlet* |
| **Receiving** | the outlet (QC senior+, or an outlet manager) | *Start receiving* when the box arrives, then scan every garment out of it. Each scan checks that line in (time and name). A garment in the box that is not on the list is accepted and marked **not on list** (its own transfer will show it missing). Progress shows *n of N checked in*. | *Receiving · outlet* |
| **Received** | same | *Close receiving* reconciles: every line not scanned is flagged **missing** (the garment's status becomes `missing`, station *Missing · outlet*, red on Items) after a confirmation that lists them; the transfer stores received / missing / not-on-list counts and an audit row. A missing garment that turns up later is scanned in on the same transfer and becomes *found*. | *Stockroom · outlet* |

**Receiving is not flooring.** A received garment sits in the outlet's **stockroom** until it is scanned on the **Floor stock** screen (`/floor`). That scan stamps `floored_on` (Pakistan date), the month's colour and who floored it, and moves the garment to *On floor · outlet*. A garment received on 1 January and floored on 5 January is floored on 5 January; one floored on 1 February gets February's colour. Only received garments can be floored (anything in transit is refused with the reason). *Floor the whole stockroom* does drop day in one go. The screen shows this month's colour, the stockroom (with each garment's received date), what was floored today, the monthly sticker sweep and the pull list. Managers can *Upload … to Shopify POS* from the Floor screen (today's floored garments) or from a received transfer (its checked-in garments): tracked, one unit, at that outlet's Shopify location only.

The dashboard lists every shipment with its step, created / dispatched / received times and transit hours. The Items export carries each garment's station, transfer, dispatched and received times and floor date.

Outlets: Karachi 1, Karachi 2, Islamabad, Lahore 1, Lahore 2, plus Online (rename to area names when ready).

---

## 8. QC

### 8.1 Random hold-back, reviewed (changed 12 Sep)
Chosen at save, after the tagger has committed, so it cannot be gamed. The senior opens **QC → Held for QC**, scans the tag, and sees **everything the tagger entered** — condition, brand, garment type, size, season, wearer, rare find — beside the photo and the garment in hand. Two buttons: **Correct as tagged**, or change the wrong fields and **Save corrections**. Corrections are applied to the garment (repriced when the condition, type or brand tier changes; the screen offers a reprint), recorded in `qc_reviews` · `shopify_visibility` against the tagger, and the hold is released. A photo mode reviews 30 random photographed garments a week the same way. The earlier blind regrading was retired as slow and unnecessary: the point is to catch and correct mistakes, and count them.

**Scorecard** (**Admin → Scorecard**, `/admin/scorecard`, monthly; was Taggers until 12 Sep). **Taggers**: per tagger — days worked, tagged, per day against target, **target achievement** (tagged ÷ days worked × daily target, capped at 100%), reviewed, corrected, **accuracy** (share of reviewed garments needing no correction), under-priced count, and a **score = 60% target achievement + 40% accuracy**. Expanding a row shows which fields QC corrected (condition too low / too high, brand, type, size…), the net price impact, and the recent corrections with the reviewer's notes. A manager **finalises** the month's score with a note into `tagger_scores` (keyed by month, person and kind of work). **Photographers**: days worked, garments photographed, per day against their daily target (set on Staff), target achievement, complete garments (a cut-out cover and at least two pictures), **completeness %**, pictures per garment, and a **score = 60% target achievement + 40% completeness**, finalised the same way. **QC reviewers**: reviews, per day, corrections found, correction rate and net price change — activity only until a review target exists. The dashboard's tagger table keeps its live view.

### 8.2 Rare finds (changed 11 Sep)
Rare finds are picked out **at grading**, before tagging, and kept in their own basket. The senior QC decides whether a piece is priced as a rare find and, if so, tells the tagger the price. On the form the tagger taps **★ Rare find** after Brand, chooses one reason (brand, vintage year, fabric quality, design, handwork, limited edition, country of make, or one added later), whose tag line and web paragraph are edited under Pricing → Rare finds, adds free text if useful, and prices it — by hand if the senior gave a price. The tag prints a **★ Rare find** band with that reason above the price, for the outlets' rare shelf; the Shopify listing carries the *Rare Find* tag and the reason in its description, for a Rare Finds collection. The earlier hand-off flow (hold tag, Set Aside rail, QC → Rare pieces) is retired; `items.is_rare`, `items.rare_reasons` and `items.rare_note` are the record.

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

Khazanay wordmark · unmarked space top-right for the month's **colour sticker** · **brand** and garment type · **Size** large · **Price** 24-pt bold · unmarked 42 × 10 mm space for the **markdown sticker** · Code 128 **barcode** and **SKU**. No condition, cost, outlet, tax line, measurements or comparison price. A rare find prints a **★ Rare find** band with the reason above the price.

---

## 12. Point of sale — separate software

The POS is **not part of this platform**. It was built here on 12 September and moved out the same day, at Usman's decision, to become its own project. Its code, migrations and reference document sit in `archive/pos/` (nothing there is compiled or deployed), with a README on how to lift it into a new project. What this platform keeps for it: the shared `items` table, the `cashier` and `outlet_manager` roles on `staff`, and **receiving a transfer floors the stock** (status on_floor, floored_on, month colour), which the POS prices from.

---

## 13. Shopify — the website and the outlets' Shopify POS

Until the separate POS exists, the outlets sell on **Shopify POS**, which can only sell products that exist on Shopify. So garments are put on Shopify from here, with a choice of where they appear (12 Sep):

| Visibility | Shopify state | Use |
|---|---|---|
| **POS only** | active, published to the Point of Sale channel, not the Online Store | outlet stock the outlets sell on Shopify POS, not shown on the website |
| **Website + POS** | active, both channels | stock sold in both places |
| **Website only** | active, Online Store only | the online channel |
| **Draft** | hidden everywhere | on Shopify but not for sale |

**How.** On **Items**, filter and tick the garments, choose the visibility, press *Upload … to Shopify*. Managers only; 25 at a time in the background with a result per SKU; the Shopify column then shows each garment's state (and an error, if Shopify refused). One product per garment, one unit of stock, the variant SKU = our SKU, price = the tag price, pictures in order (cut-outs standing in), the rare-find text where set. Stock is placed at the **outlet's Shopify location** when the garment is at an outlet with one mapped (Settings → Shopify). Otherwise the unit sits at the store's default location with **continue selling when out of stock** on, the way the previous system worked (matched 12 Sep from Usman's screenshot): Shopify admin and every POS show "1 in stock", any outlet can bill it, and the order webhook takes it off Shopify the moment it sells. Products carry two variant options, Size and Condition, as before, and a channel tag (`POS only`, `Website` or `Draft`) so Shopify's automated collections — the Google/Meta feed collection above all — can exclude outlet stock with the rule *tag is not equal to POS only*. The garment page's *Send to Shopify* does the same for one garment (website + POS).

**Sales come back.** The app registers its own *orders/paid* webhook with Shopify (button on Settings → Shopify; the health page shows whether it is registered) pointing at `POST /api/shopify/webhook`, signed with the app's client secret (a hand-made webhook signed with `SHOPIFY_WEBHOOK_SECRET` is also accepted). It marks each garment on the order **sold** here — whether it sold on the website or on a Shopify POS at an outlet — with the price paid, the markdown stage it was at, and an audit line saying which. Shopify itself sets the stock to zero.

**Set-up (Usman):** `SHOPIFY_STORE_DOMAIN` plus either `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` (a Dev Dashboard app with `write_products`, `write_inventory`, `write_publications`, `read_orders`, installed on the store; tokens are fetched by client-credentials grant and refreshed every 24 h) or a legacy `SHOPIFY_ADMIN_ACCESS_TOKEN`, and `SHOPIFY_WEBHOOK_SECRET`, all in Vercel; press *Register order webhook* on Settings → Shopify once; map each outlet to its Shopify location there. Done 12 Sep: connected, `read_locations` added to the app's scopes, outlets mapped, webhook registered; the Shopify admin test notification never arrived, which is why the app registers its own.

**Online channel (parked).** The garment page keeps channel, photos, listing preview and *Send to Shopify* / *Unlist*; the photography station feeds it.

---

## 14. Technical reference

**Stack:** Next.js 16 (App Router, cache components), React 19, TypeScript, Tailwind + shadcn/ui, Supabase (Postgres, Storage), Vercel. Node 24 runs the tests natively (`node --test`, no framework).

**Key code:**
- `lib/pricing/engine.ts` — the pure pricing chain; `engine.test.ts` pins both spec verification tables
- `lib/pricing/quote.ts` — the price quote used by `/api/price` and item save
- `lib/pricing/repo.ts` — loads settings, grades, profiles, sub-categories, lots from the database
- `lib/pricing/sheet.ts` — the Pricing tab as an Excel workbook and back (`sheet.test.ts` round-trips it)
- `lib/pricing/compare.ts` — comparison price lookup · `lib/pricing/lot-pnl.ts` · `lib/pricing/floor.ts` (the sweep logic, used by the POS)
- `lib/brands/normalise.ts` — brand cleanup and fuzzy match · `lib/barcode/code128.ts` — barcode SVG · `lib/shopify/*`
- `lib/auth/*` — PIN hashing, signed sessions, `requireStaff` / `requireManager`
- `lib/supabase/proxy.ts` — route gating by session and role

**API (all under `/api`):** `price`, `items`, `items/[sku]`, `reference`, `brands`, `lots`, `transfers`, `qc`, `photos`, `tags/[sku]/barcode`, `export`, `dashboard`, `auth/*`, `admin/{settings,profiles,grades,sub-categories,categories,brands,brands/logo,brands/quick-picks,rare-reasons,staff,outlets,scorecard,reference-prices,pricing/sheet}`, `shopify/{push,push-bulk,webhook}`.

**Migrations (41, all applied):** `pricing_schema` · `pricing_seed` (generated from code by `test/gen-seed.ts`) · `sub_category_codes` · `tagging_support` · `lots_and_weights` · `channels_photos_shopify` · `staff_pins_transfers` · `transfer_seq` · `lot_split` · `lot_description_pieces` · `lot_imported_sequence` · `settings_changed_by` · `categories_flat_gender` · `categories_two_level` · `subcategory_planning_rates` · `price_steps_alerts` · `brands_source` · `qc_and_targets` · `qc_hold` · `standard_cost` · `reference_prices` · `rare_handoff` · `outlet_min_grade` · `outlet_override` · `subcategory_season` · `brand_quick_pick` · `brand_logo` · `brand_quick_picks_by_category` · `size_labels` · `rare_note` · `rare_reasons` · `photographer` · `rare_reasons_table` · `pos_sales` · `pos_anon_temp` · `pos_v2` · `qc_reviews` · `shopify_visibility` — plus the health check and two POS migrations from a parallel session.

**Environment (Vercel + `.env.local`):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only; also signs sessions), optional `SESSION_SECRET`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` (or legacy `SHOPIFY_ADMIN_ACCESS_TOKEN`), `SHOPIFY_WEBHOOK_SECRET`, optional `SHOPIFY_API_VERSION`.

**Operating it:** `npm run build` · `npm test` · `npx supabase db push --yes` (migrations) · `npx vercel --prod --yes` (deploy). GitHub → Vercel auto-deploy is connected for previews on push; production deploys come from the CLI while work is on `pricing-engine`. Claude's allow rules live in `.claude/settings.local.json`.

---

## 15. Decisions worth remembering

- **Markdowns round** (25/50/75 → 1,390 / 890 / 490 on a 1,790 shirt); the original spec's floor example was an error, corrected by spec v2.
- **Standard cost per sub-category, not scale weight**, sets the shelf price (10 Sep). Weight-based pricing remains in the engine for lot P&L.
- **Costs are entered before sales tax, duty included.** Some vendors charge tax and local-market ones do not, so the engine adds the non-recoverable input tax itself (never on local lots). Duty per kg applies only to kg lots; adding it to per-piece costs was tried and reverted the same day.
- **Lot numbers never reuse** a deleted number (tried and reverted the same day).
- **Two-level catalogue per gender** (Category → Sub-category) with type-to-find, after trying flat.
- **QC by random hold-back at tagging**, not at the outlet or by shipment sample; reviewed with the tagger's entries visible and corrected, not regraded blind (12 Sep).
- **Rare finds are decided at grading**, marked and priced by the tagger (at the senior's price when given); the hand-off flow was retired on 11 Sep.
- **Cost data is hidden from taggers at the API**, not just the UI.
- **Fuzzy brand matching skips 4-letter names** (*Zora* is not corrected to *Zara*) — deliberate.

---

## 16. Open items

**Yours to do**
- Overwrite *Cost per piece* on the sheet with real purchase costs (seeded values are ~11% high — they were landed costs)
- Revert two test edits still on the live sheet: *Men Button-down shirt* weight 0.01 (was 0.30) and input tax 5% (spec says 18%) — or confirm them
- Confirm or correct the 303 research comparison prices when/if they go on tags or online
- Rename outlets to area names (Settings → Shopify) and map each to its Shopify location; add Compression Wear and Waistcoat sub-categories
- Delete the three spec-verification lots (`LOT-B-01-S`, `-W`, `LOT-A-01`) and the two POS demo items once real stock arrives
- Choose a scale (Bluetooth keyboard output) and a station label printer — the two hardware changes that cut the most seconds

**Before real stock — security**
- Remove the last temporary bypasses: `/price` in `lib/supabase/proxy.ts`, and the `temp_anon_read` policies plus the two DEMO garments (migrations `20260907220000` and `20260908090100`)
- Set `CRON_SECRET` in Vercel so the hourly Shopify sold-out retry runs

**Next phase**
- POS: stock counts per outlet; customer accounts; exchanges as one receipt; the sell-through numbers feeding Selling profiles automatically
- Shopify orders webhook (an online sale marks the item sold)
- Stock counts per outlet; drop day / monthly sweep move to the POS
- Merge `pricing-engine` into `main` so production auto-deploys

---

*Last updated 10 September 2026, commit `b9ecbe7`.*
