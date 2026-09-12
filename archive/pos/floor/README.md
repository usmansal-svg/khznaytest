# Floor stock — moved to the POS (13 Sep 2026)

Usman's decision: putting received garments on the floor, the monthly
sticker sweep and the pull are outlet work, so they belong to the POS
software, as its own menu item. This folder holds the screen as it last ran
in the tagging app:

- `page.tsx` — route `/floor`
- `floor-page.tsx` — the screen: scan a received garment to floor it today
  (colour of the month, `floored_on`, `floored_by`), "Floor the whole
  stockroom", today's floored list with *Upload to Shopify POS*, the monthly
  sweep (sticker per markdown stage), the pull list
- `api-route.ts` — `GET /api/floor?outlet_id` and `POST /api/floor { action: floor | pull, outlet_id, skus? }`
- `lib-floor.ts` — copy of `lib/pricing/floor.ts` (sweep / stage maths); the
  original stays in the tagging repo because the dashboard reads it

What it writes on `items`: `status` tagged → on_floor (floor) or → pulled
(pull), `floored_on` (Pakistan date), `colour_tag`, `floored_by`. It honours
`stage_override` and `pull_requested` from Commercials.

In the tagging app the flow now ends at **Received**: garments sit in the
outlet's stockroom (`received_at` set, `floored_on` null) until the POS
floors them. The Items screen's station wording (*Stockroom · X* → *On
floor · X*) reads the same columns, so it keeps working once the POS writes
them.
