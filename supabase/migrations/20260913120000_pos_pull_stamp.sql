-- The POS (separate app, same database) records who pulled a garment from
-- the floor and when, the way floored_by / floored_on record the flooring.
alter table public.items
  add column if not exists pulled_at timestamptz,
  add column if not exists pulled_by bigint references public.staff (id);
comment on column public.items.pulled_at is 'When the outlet marked the garment pulled from the floor (POS Floor screen)';
