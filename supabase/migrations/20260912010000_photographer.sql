-- A photographer role: sees the Photos station only. Items remember who
-- photographed them first and when, for the photographer's daily target.
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check check (role in ('tagger', 'qc_senior', 'manager', 'founder', 'photographer'));
alter table public.items add column if not exists photographed_by integer references public.staff(id);
alter table public.items add column if not exists photographed_at timestamptz;
create index if not exists items_photographed_idx on public.items (photographed_by, photographed_at);
