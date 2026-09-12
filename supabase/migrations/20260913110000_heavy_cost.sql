-- Garments bought by weight: the same type can be light or heavy, and the
-- heavy one costs more per piece. A sub-category may carry a second, heavy
-- cost; the tagger picks Light / Heavy on the tag form and the price uses the
-- matching cost. The Shopify tag stays the same either way (13 Sep).
alter table public.sub_categories add column if not exists heavy_cost_pkr numeric check (heavy_cost_pkr is null or heavy_cost_pkr > 0);
alter table public.items add column if not exists weight_class text not null default 'light' check (weight_class in ('light', 'heavy'));
