# POS — parked here for its own project

Built 12 September 2026 inside the tagging repo, then moved out of the app the same day because the POS is to be separate software. Nothing in this folder is compiled or deployed.

What is here:

- `app-pos/` — the pages (`/pos`, receive, stock, sales, session, reports)
- `api-pos/` — the API routes (me, item, checkout, session, sales, sale/[id], void, return, receive, stock, sweep, reports, shopify-sync)
- `components-pos/` — the screens (shell, context, till, receive, stock, sales, session, reports, receipt)
- `lib-pos/` — today's price from months on the floor, the outlet gate, the Shopify sold-out queue worker
- `migrations/` — copies of the two POS migrations; the tables (`sales`, `sale_items`, `till_sessions`, `shopify_sync_queue`, `receipt_counter`) and functions (`checkout_sale`, `void_sale`, `return_sale_item`) already exist in the shared database
- `KHAZANAY-POS.md` — the full reference

How to lift it into a new project: create a Next.js app with the same Supabase project (or a synced copy), copy the four folders back to `app/pos`, `app/api/pos`, `components/pos`, `lib/pos`, bring `lib/pricing/{engine,constants,repo,floor}.ts`, `lib/auth/*`, `lib/supabase/*`, `components/brand-logo.tsx` and the shadcn `components/ui` primitives, and re-add the nightly cron for `/api/pos/shopify-sync` in `vercel.json`. The roles `cashier` and `outlet_manager` already exist on `staff`.


## Added 13 Sep 2026: Floor stock

The Floor stock screen (floor by scan, drop day, sticker sweep, pull) moved out of the tagging app into `floor/` here — see `floor/README.md`. It becomes a menu item of the POS.
