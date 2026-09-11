-- Quick-pick brands on the tag form are chosen by hand: the order here is
-- the button order (1..10 shown, 11..20 under "More brands"). Null = not shown.
alter table public.brands add column if not exists quick_pick_order integer;
create index if not exists brands_quick_pick_idx on public.brands (quick_pick_order) where quick_pick_order is not null;
