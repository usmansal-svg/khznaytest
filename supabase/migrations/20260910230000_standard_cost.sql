-- Pricing from a standard cost per garment (per sub-category) instead of
-- scale weight × lot rate. Lots still record what was actually paid; the
-- lot P&L compares actual against standard.
alter table public.sub_categories add column if not exists standard_cost_pkr numeric check (standard_cost_pkr is null or standard_cost_pkr > 0);
