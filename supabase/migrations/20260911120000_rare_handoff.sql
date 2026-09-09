-- Rare finds: the tagger identifies and hands off; a senior prices with
-- the garment in hand. Until then the item is set aside with no price.
alter table public.items drop constraint if exists items_price_or_manual;
alter table public.items add constraint items_price_or_manual check (price is not null or price_manual is not null or status = 'set_aside');
alter table public.items
  add column if not exists rare_triggers text[],
  add column if not exists priced_by     bigint references public.staff (id),
  add column if not exists priced_at     timestamptz;
