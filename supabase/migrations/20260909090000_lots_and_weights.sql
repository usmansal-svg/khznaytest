-- Tagging spec v2 (2026-09-09): a garment's cost is its own weight times the
-- effective rate of the lot it came from. Lots carry the buying basis and the
-- rate; garments are weighed at tagging; rejects are recorded as items.
-- Garments already tagged keep their price — nothing here reprices them.

-- ------------------------------------------------------------------ lots
alter table public.lots
  add column if not exists basis             text not null default 'kg' check (basis in ('kg', 'pc')),
  -- USD per kg for kg lots, PKR per piece for pc lots
  add column if not exists rate              numeric check (rate is null or rate > 0),
  -- null while open; set at true-up when the lot closes
  add column if not exists kg_tagged         numeric check (kg_tagged is null or kg_tagged >= 0),
  add column if not exists provisional_yield numeric not null default 0.90 check (provisional_yield > 0 and provisional_yield <= 1),
  add column if not exists status            text not null default 'open' check (status in ('open', 'closed')),
  add column if not exists parent_lot_id     bigint references public.lots (id),
  add column if not exists closed_at         timestamptz;

comment on column public.lots.kg is 'kg bought (null for per-piece lots)';
comment on column public.lots.rate is 'USD/kg for kg lots, PKR per piece for pc lots';

-- Carry across any rate entered under the older column name.
update public.lots set rate = rate_usd_per_kg where rate is null and rate_usd_per_kg is not null;

create index if not exists lots_status_idx on public.lots (status, created_at desc);
create index if not exists lots_parent_idx on public.lots (parent_lot_id);

-- ----------------------------------------------------------------- items
alter table public.items add column if not exists weight_kg numeric check (weight_kg is null or weight_kg > 0);

alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check
  check (status in ('tagged', 'on_floor', 'sold', 'pulled', 'set_aside', 'rejected'));

create index if not exists items_lot_idx on public.items (lot_id);

-- ---------------------------------------------------------------- grades
-- Rejected is a grade with price 0 so the reject rate is measured, not assumed.
insert into public.grades (code, name, multiplier, share_of_intake, sort_order)
values ('rejected', 'Rejected', 0, 0.03, 5)
on conflict (code) do nothing;

-- -------------------------------------------------------------- settings
-- Provisional yield used while a lot is open. 0.90 until the business has
-- three or four closed lots of its own history (open item #2).
alter table public.settings add column if not exists default_provisional_yield numeric not null default 0.90;

-- ------------------------------------------------------------ categories
-- Vendor rate per category from spec section 8 — planning only. The lot's
-- own rate always drives real cost.
alter table public.categories add column if not exists planning_rate_usd_per_kg numeric;
update public.categories set planning_rate_usd_per_kg = v.rate
from (values
  ('summer-men-tops-fashion', 6.00), ('summer-men-bottoms-fashion', 6.00), ('summer-men-sports', 10.00),
  ('winter-men-fashion', 4.00), ('winter-men-sports', 10.00),
  ('summer-women-tops-fashion', 6.00), ('summer-women-bottoms', 6.00), ('summer-women-sports', 5.00),
  ('winter-women-fashion', 4.00), ('winter-women-sports', 5.00),
  ('children-summer', 10.00), ('children-winter', 8.00),
  ('palazzo', 2.60), ('reon-pajama', 3.30)
) as v(slug, rate)
where public.categories.slug = v.slug;
