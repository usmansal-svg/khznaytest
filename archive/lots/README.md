# Lots — moved to the commercial software (12 Sep 2026)

Usman's decision: purchasing a lot (supplier, basis, rate, kg / pieces, duty
and tax treatment, splits, close with true-up, lot P&L) is **commercial**
data and belongs in the commercial software, not the tagging software. This
folder holds the code that did it here, for the move:

- `components/lots-admin.tsx` — the Lots screen (create, split, edit, close, delete, P&L table)
- `api/route.ts` — `GET/POST/PATCH/DELETE /api/lots`
- `lib/lot-pnl.ts` — the P&L roll-up (pieces, % done, rejects, cost tagged vs actual cost per piece, GP per piece)
- the two migrations that shaped `public.lots` (`lots_and_weights`, `lot_imported_sequence`)

## The shared table — the contract between the two systems

Both systems use the **same Supabase database**. The commercial software
**owns** `public.lots` and writes it; the tagging software **reads** it and
writes nothing but `items.lot_id`.

What tagging reads (nothing else):

| column | meaning |
|---|---|
| `id` | referenced by `items.lot_id` |
| `code` | the lot number printed on reports and the Items screen (`LOT-0001`, `LOT-0001-A` for a split pile) |
| `description` | what was bought, shown in the tag form's lot picker |
| `pieces` | the quantity expected; the Lots screen shows tagged ÷ pieces |
| `status` | `open` = can be tagged from; `closed` / `split` = not offered in the tag form |

Financial columns (`supplier`, `basis`, `rate`, `kg`, `kg_tagged`,
`provisional_yield`, `imported`, `notes`, `arrived_on`, `closed_at`,
`parent_lot_id`) stay in the table for the commercial side and are never
selected by the tagging app.

What the commercial software can read back from tagging, per lot: the
`items` rows with that `lot_id` — count, grade mix (`grade_code`, rejects),
`landed_cost`, `price` / `price_manual`, `status` (sold, pulled…),
`sold_price`. That is everything the old P&L used; `lib/lot-pnl.ts` shows
the roll-up.

## Pricing no longer looks at the lot

The tag price comes from the sub-category's **cost per piece** (Pricing →
Categories) and the constants. The old fall-back — pricing by scale weight
at the lot's USD/kg rate — is retired: a sub-category with no cost per piece
cannot be tagged until one is set. The lot on a garment is provenance only.
