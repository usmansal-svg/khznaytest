-- A sub-category in a children's band can be for girls or boys only, like a
-- category (14 Sep 2026): a Blouse under Tops is offered to girls, a Skort
-- under Bottoms to girls, without splitting the category.
alter table public.sub_categories add column if not exists for_wearer text not null default 'any' check (for_wearer in ('any', 'girls', 'boys'));
