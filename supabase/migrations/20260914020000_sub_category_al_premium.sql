-- A hand-set Premium price for affordable-luxury brands on this garment type
-- (14 Sep 2026). Blank = the AL multiple applied to the regular Premium.
alter table public.sub_categories add column if not exists al_premium_pkr int check (al_premium_pkr is null or al_premium_pkr >= 0);
