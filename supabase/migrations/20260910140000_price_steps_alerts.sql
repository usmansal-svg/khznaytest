-- Price adjustment in 5% steps, manual prices for exceptional pieces, and a
-- log of every garment priced below the pricing sheet.

alter table public.items
  add column if not exists adjust_pct     int not null default 0 check (adjust_pct between -50 and 100 and adjust_pct % 5 = 0),
  -- the pricing-sheet price at this grade with no adjustment, for the audit
  add column if not exists standard_price int,
  add column if not exists below_reason   text;

create table if not exists public.price_alerts (
  id             bigint generated always as identity primary key,
  item_id        bigint not null references public.items (id) on delete cascade,
  sku            text not null,
  tagged_by      bigint references public.staff (id),
  standard_price int not null,
  final_price    int not null,
  pct_below      numeric not null,
  kind           text not null check (kind in ('adjustment', 'manual')),
  reason         text,
  created_at     timestamptz not null default now(),
  reviewed_by    bigint references public.staff (id),
  reviewed_at    timestamptz
);
create index if not exists price_alerts_created_idx on public.price_alerts (created_at desc);
create index if not exists price_alerts_tagger_idx on public.price_alerts (tagged_by, created_at desc);
alter table public.price_alerts enable row level security;
create policy "all" on public.price_alerts for all to authenticated using (true) with check (true);
