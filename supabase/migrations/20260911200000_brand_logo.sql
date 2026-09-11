-- A logo per brand, shown on the quick-pick buttons of the tag form.
alter table public.brands add column if not exists logo_url text;
