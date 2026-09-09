-- Flatten the catalogue: what used to be "sub-categories" are the
-- categories, each with a gender. The old grouping rows stay only to
-- satisfy the foreign key; the UI no longer shows them.

alter table public.sub_categories
  add column if not exists gender text check (gender is null or gender in ('men', 'women', 'teenage', 'kid', 'toddler', 'infant'));

-- Backfill from the old groups.
update public.sub_categories s set gender = case
  when s.category_slug like '%men%' and s.category_slug not like '%women%' then 'men'
  when s.category_slug like '%women%' then 'women'
  when s.category_slug like 'children%' then 'kid'
  when s.category_slug in ('palazzo', 'reon-pajama') then 'women'
  else 'men' end
where s.gender is null;

alter table public.sub_categories alter column gender set not null;
create index if not exists sub_categories_gender_idx on public.sub_categories (gender, name);

-- One holder row per gender for new categories to hang off.
insert into public.categories (slug, name, sort_order) values
  ('gender-men', 'Men', 101), ('gender-women', 'Women', 102), ('gender-teenage', 'Teenage', 103),
  ('gender-kid', 'Kid', 104), ('gender-toddler', 'Toddler', 105), ('gender-infant', 'Infant', 106)
on conflict (slug) do nothing;

-- Garments carry the category's gender as their wearer; keep the old
-- values valid for rows already tagged.
alter table public.items drop constraint if exists items_wearer_check;
alter table public.items add constraint items_wearer_check
  check (wearer is null or wearer in ('men', 'women', 'teenage', 'kid', 'toddler', 'infant', 'boy', 'girl', 'unisex'));
