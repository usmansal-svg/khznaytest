-- Planning rates per sub-category for the estimate table: what you expect to
-- pay per kg (USD) and per piece (PKR). Real garments still cost from their lot.
alter table public.sub_categories add column if not exists planning_rate_usd_per_kg numeric check (planning_rate_usd_per_kg is null or planning_rate_usd_per_kg > 0);
-- Seed from the old category planning rates where present.
update public.sub_categories s set planning_rate_usd_per_kg = c.planning_rate_usd_per_kg
from public.categories c where c.slug = s.category_slug and s.planning_rate_usd_per_kg is null and c.planning_rate_usd_per_kg is not null;
