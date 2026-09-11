# Khazanay POS — Reference

*The point-of-sale platform for the outlets, built 12 September 2026 on the same database as the tagging system. How it works, why it works that way, and what is still open. Companion to [KHAZANAY-TAGGING-SYSTEM.md](KHAZANAY-TAGGING-SYSTEM.md).*

**Live:** https://khazanaytest.vercel.app/pos · **Repo branch:** `pricing-engine` · **Database:** the tagging system's Supabase project

---

## 1. What it is, and how it links to tagging

The POS is a separate set of screens with its own roles, but it is not a separate system. It reads and writes the **same `items` table** that the tagging software fills. That table is the single record of every garment: what it is, what it was priced at, where it was sent, when it went on the floor, when it sold and for how much.

There is no import and no export between the two. Stock reaches an outlet's POS by being **received** there, and a sale at the till writes straight back to the garment's row, which the tagging dashboard and the pricing reports read.

```
Tagging (warehouse)                    POS (outlet)
─────────────────                      ────────────
tag → price → transfer sent ───────►   receive → on the floor (today, this month's colour)
                                       till → sold (price, stage, cashier, receipt)
                                       return / void → back on the floor
Pricing sheet ◄──────── Reports: sell-through, days to sell, realised price, markdown mix
Shopify ◄────────────── sold at an outlet → taken off the website
```

---

## 2. People and roles

Sign-in is the same **name + PIN** screen as the tagging system. Roles are set on **Admin → Staff**, and outlet roles must have an **outlet** set there.

| Role | Sees and does |
|---|---|
| **Cashier** | The POS only, for their own outlet: till, receive, stock, sales, till session. Cannot void or override. |
| **Outlet manager** | Everything a cashier can, plus: void a receipt, return a garment, sell stock not received at this outlet (override), mark pulls. |
| **Manager / Founder** | Opens the POS from the Admin menu, picks any outlet from the switcher in the header, and sees **Reports**. |

Enforced at three points: the route gate (an outlet role is redirected to `/pos` from anywhere else), the screens, and every API (each call carries the person's outlet; managers may pass another).

---

## 3. Screens

| Tab | Path | Purpose |
|---|---|---|
| **Till** | `/pos` | Scan, price for today, take payment, print the receipt (§5) |
| **Receive** | `/pos/receive` | Transfers on their way to this outlet; receiving floors the stock (§4) |
| **Stock** | `/pos/stock` | What is on the floor, its age and today's price; the monthly sweep (§8) |
| **Sales** | `/pos/sales` | Receipts by date or search; reprint, return, void (§7) |
| **Till session** | `/pos/session` | Open with a float, close by counting the drawer (§6) |
| **Reports** | `/pos/reports` | Head office only: what sells, how fast, at what price (§9) |

The header shows the Khazanay logo (home), the outlet (a switcher for head office), whether the till is open, the signed-in name, and sign-out.

---

## 4. Receiving stock — how a garment gets onto the POS

1. At the warehouse, a supervisor builds a transfer to the outlet, scans the tags onto it, prints the sheet, and marks it **sent**.
2. At the outlet, **Receive** lists the transfers on their way, with every garment on each.
3. The outlet checks the box against the list and taps **Receive all**, or scans the transfer code printed on the sheet.
4. Every garment on the transfer becomes **on the floor** at that outlet, with `floored_on` = today (Pakistan date) and `colour_tag` = this month's sticker colour. The **markdown clock starts** from this date.

Receiving from the warehouse side (Transfers → mark received) does exactly the same. Held-for-QC and online-only garments cannot be put on a transfer in the first place.

---

## 5. The till

**Scan.** The cashier scans the tag (or types the SKU). The server looks the garment up and prices it **for today**:

```
stage      = months on the floor: 0 → full price, 1 → 25% off, 2 → half price, 3 → 75% off, 4+ → due to pull (sells at 75% off)
price      = tagged price walked down the ladder from the live pricing sheet, charm-rounded (ends in 90)
```

The line shows brand, garment, size, the stage, the list price when marked down, days on the floor, a ★ for rare finds, and a 🌐 note if the garment is also listed online.

**Checks.** A garment is refused if it is already sold (with the date and price), pulled, damaged, rejected, or has no price. A garment that was never received at this outlet, or that belongs to another outlet, shows a warning; only an outlet manager can tick **Sell anyway**.

**Price changes.** The cashier can type a different price on the line. A price different from the shelf price **requires a reason**, which is stored beside the shelf price on the receipt line for later review.

**Payment.** Discount on the receipt; cash with tendered and change (quick buttons for exact, 500, 1,000, 2,000, 5,000); card, JazzCash, Easypaisa or bank transfer with an optional reference; an optional customer phone for exchanges. The till must be **open** (§6) to sell.

**Atomic.** The sale is written by one database function: every line is marked sold with its price, stage and cashier, and the receipt is numbered `KHZ-YYYYMMDD-0001` per day, or nothing is written at all. Two tills cannot sell the same garment.

**Receipt.** 80 mm, printed from the browser: outlet, receipt number, time, cashier, lines with stage, subtotal, discount, total, payment, change, and the exchange line.

---

## 6. Till sessions and cash

- **Open** the till with the opening float in the drawer. Selling is blocked until then.
- **Close** by counting the cash in the drawer. The screen shows receipts, takings by payment method, cash refunds, and the **expected cash** (float + cash sales − cash refunds), then records the difference as short, over or balanced, with an optional note.
- Every sale carries its session, so a day's takings reconcile to one open-and-close.

---

## 7. Sales, returns and voids

**Sales** lists the outlet's receipts for a date range, searchable by receipt number or customer phone, with takings by payment method and refunds. Open a receipt to **reprint** it.

**Return one garment**: reason (required), refund amount (up to the sold price), and where it goes: **back on the floor** (sellable again at today's price) or **damaged** (off the floor, status `returned_damaged`). The line is struck through on the receipt and the refund counts against the session's cash.

**Void a receipt** (outlet manager): reason required; every garment goes back on the floor and the receipt is kept and marked void. A voided receipt that had listed garments does not relist them automatically; that is a manual step on the garment page.

Both are audited under the person's name.

---

## 8. Stock and the monthly sweep

**Stock** lists everything on the floor at the outlet, oldest first: SKU, garment, brand, size, condition, stage, price today (with the list price struck through when marked down), days on the floor and colour. Totals by stage at the top. Rows due to pull are tinted red.

**Monthly sweep** (spec section 5): two lists for walking the floor on the 1st.

- **Stickers this month**: every garment that moved a rung, with the sticker to put on (25% OFF · HALF PRICE · LAST CHANCE 75% OFF) and the price it now rings up at.
- **Pull from the floor**: garments four colours back, to box for the warehouse. An outlet manager marks them pulled, which takes them off the floor count.

---

## 9. Reports — the loop back into pricing

Head office only, for any date range and any or all outlets.

| Block | What it shows |
|---|---|
| **Totals** | Garments sold, takings, realised price as a % of list, gross profit %, average sold price, returns and refunds |
| **Sold at which markdown** | Share sold at full, 25%, half and 75%, beside what the Fast / Standard / Slow profiles assume |
| **By condition** | Sold, average sold price, % of list realised, GP, median days from floor to sale, sell-through of what was floored in the window, full/25/50/75 mix |
| **By selling profile** | The same, per profile — the biggest input to the pricing multiple |
| **By sub-category** | The same, per garment type |
| **By outlet** | The same, per outlet |
| **By day** | Takings per day |

**How to use it.** After a few months: if Fast garments are selling mostly at full price with a short median time, the Fast profile's full-price share can go up and its multiple down (prices fall, more sells at full). If a sub-category sells slowly and mostly at 50% off, move it to Slow or lower its value index. If a condition's sell-through is far from its assumed intake share, adjust the grade shares. Today these changes are made by hand on Pricing; once the data is deep enough the reports can propose the profile shares directly.

---

## 10. Shopify — no double sales

Some outlet stock is also listed on the website. When such a garment is sold at the till:

1. The sale queues a **sold-out** job for the garment.
2. The till works the queue at once: the product is unlisted on Shopify and the garment's online status becomes *unlisted*. The cashier sees "taken off Shopify" or a warning that it is queued.
3. If Shopify could not be reached, the job stays in the queue with the error, the garment shows the error on its page, and the queue is retried after every later sale and once a night by a scheduled job.

Needs `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_ACCESS_TOKEN` (already required by the online channel) and `CRON_SECRET` for the nightly run, all set in Vercel. The Vercel plan allows one scheduled run a day, hence nightly rather than hourly.

The other direction, an online sale marking the garment sold so an outlet cannot sell it, is the Shopify orders webhook on the open list.

---

## 11. Data model

**Tables**

- `sales` — one row per receipt: receipt number, outlet, cashier, session, subtotal, discount, total, payment method, tendered, change, reference, customer phone, note, void fields.
- `sale_items` — one row per garment sold: list price, **shelf price**, sold price, stage, **override reason**, and the return fields (when, by whom, reason, refund, disposition). A garment may appear once per open sale; after a return it can be sold again.
- `till_sessions` — outlet, opened by/at, opening float, closed by/at, counted cash, expected cash, note.
- `shopify_sync_queue` — item, action, attempts, last error, done at.
- `receipt_counter` — per-day sequence for receipt numbers.

**On `items`**: `outlet_id`, `received_at`, `floored_on`, `colour_tag`, `status` (`tagged` · `on_floor` · `sold` · `pulled` · `returned_damaged` · `set_aside` · `rejected`), `sold_at`, `sold_price`, `sold_stage`.

**Functions**: `checkout_sale` (atomic sale with outlet and cashier), `void_sale`, `return_sale_item`.

**Migrations**: `pos_sales` (first scaffold), `pos_anon_temp` (demo garments and open access — to be dropped), `pos_v2` (everything above).

---

## 12. Technical reference

**Code**

- `components/pos/` — `pos-shell.tsx` (header and tabs), `pos-context.tsx` (who and which outlet; every POS call carries `?outlet=` for head office), `till.tsx`, `receive.tsx`, `stock.tsx`, `sales.tsx`, `session.tsx`, `reports.tsx`, `receipt.tsx` (the 80 mm receipt and its print rule)
- `lib/pos/pricing.ts` — today's price from the tagged price and months on the floor; `lib/pos/auth.ts` — the outlet gate; `lib/pos/shopify-soldout.ts` — the queue and the worker
- `lib/pricing/floor.ts` — the sweep and pull logic

**API** (all need a signed-in outlet role or manager)

`/api/pos/me` · `/api/pos/item?sku=` · `/api/pos/checkout` · `/api/pos/session` (GET / POST open / PATCH close) · `/api/pos/sales` · `/api/pos/sale/[id]` · `/api/pos/return` · `/api/pos/void` · `/api/pos/receive` · `/api/pos/stock` · `/api/pos/sweep` (GET lists / POST pull) · `/api/pos/reports` (managers) · `/api/pos/shopify-sync` (till and cron)

**Environment**: the tagging system's variables plus `CRON_SECRET`. **Cron**: `vercel.json`, nightly at 02:30 UTC.

**Operating it**: same as the tagging system — `npm run build`, `npm test`, `npx supabase db push --yes`, `npx vercel --prod --yes`, commit and push.

---

## 13. Decisions worth remembering

- **Same database, not a second one.** A warehouse server or a synced copy was considered and rejected: two databases syncing is where these systems break. The phone and the tills talk to one cloud database.
- **Receiving is flooring.** The markdown clock starts when the outlet receives, not when the warehouse sends, because that is when the customer can buy it.
- **The till prices, not the tag.** The tag carries the full price; the till computes today's price from the floor date and the live ladder, so a sticker error cannot change what is charged.
- **Price changes need a reason**, and the shelf price is stored beside the sold price, so under-selling is visible.
- **Sold at the outlet means off the website at once**, with a retry queue, because a double sale costs a customer.
- **The old open-without-login till access was closed** when the real POS arrived.

---

## 14. Open items

**Before the first outlet goes live**
- Add the cashier and outlet manager on Staff with their outlet set
- Set `CRON_SECRET` in Vercel
- Drop the two DEMO garments and the temporary anonymous read policies from the first scaffold (migration `20260907220000`)
- A receipt printer that prints from the browser (any 80 mm thermal printer with a driver on the till's machine)

**Next**
- Shopify orders webhook: an online sale marks the garment sold, so an outlet cannot sell it
- Stock counts per outlet with a scan-everything reconciliation against what the POS thinks is on the floor
- Exchanges as one receipt (return and new sale together)
- Customer accounts and a loyalty view by phone number
- Automatic profile-share suggestions from the reports once a few months of sales exist
- Cash-drawer and card-terminal integration if the outlets move to hardware tills

---

*Last updated 12 September 2026, commit `9d261fb`.*
