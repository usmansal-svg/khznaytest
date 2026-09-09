-- "New in store" comparison prices for the tag. Most specific row wins:
-- brand × sub-category, brand × category, tier × sub-category, tier ×
-- category; then the sub-category market price; then a formula.
create table if not exists public.reference_prices (
  id                bigint generated always as identity primary key,
  brand_id          bigint references public.brands (id) on delete cascade,
  tier              text check (tier is null or tier in ('regular', 'affordable_luxury', 'ultra_luxury')),
  sub_category_slug text references public.sub_categories (slug) on delete cascade,
  category_slug     text references public.categories (slug) on delete cascade,
  new_price_pkr     int not null check (new_price_pkr > 0),
  source            text not null default 'founder' check (source in ('founder', 'research', 'formula')),
  confirmed         boolean not null default false,
  note              text,
  updated_by        bigint references public.staff (id),
  updated_at        timestamptz not null default now(),
  -- exactly one of brand/tier, and one of sub-category/category
  check ((brand_id is not null) <> (tier is not null)),
  check ((sub_category_slug is not null) <> (category_slug is not null))
);
create unique index if not exists reference_prices_key on public.reference_prices (coalesce(brand_id, 0), coalesce(tier, ''), coalesce(sub_category_slug, ''), coalesce(category_slug, ''));
alter table public.reference_prices enable row level security;
create policy "read" on public.reference_prices for select to authenticated using (true);
create policy "write" on public.reference_prices for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- Formula fallback: new price ≈ Premium shelf price × factor per tier.
alter table public.settings
  add column if not exists compare_factor_regular    numeric not null default 3.0,
  add column if not exists compare_factor_affordable numeric not null default 3.5,
  add column if not exists compare_formula_enabled   boolean not null default true;
