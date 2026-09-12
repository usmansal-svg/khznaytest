-- A category or sub-category can carry a hand-set Shopify tag (12 Sep):
-- blank means the automatic one ("Men Shirts", "Men Formal Shirt").
alter table public.categories     add column if not exists shopify_tag text;
alter table public.sub_categories add column if not exists shopify_tag text;
