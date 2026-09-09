-- Brands added by taggers at the point of tagging, for the admin to tier.
alter table public.brands
  add column if not exists source   text not null default 'seed' check (source in ('seed', 'admin', 'tagger')),
  add column if not exists added_by bigint references public.staff (id),
  add column if not exists added_at timestamptz not null default now();
