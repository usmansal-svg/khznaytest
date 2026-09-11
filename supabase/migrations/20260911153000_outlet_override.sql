-- A garment below the outlet minimum can still be tagged for an outlet on
-- purpose. The override is recorded here and audited; transfers honour it.
alter table public.items add column if not exists outlet_override boolean not null default false;
