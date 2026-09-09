-- Two levels under each gender: Category (Tops & Blouses) → Sub-category
-- (Crop top). Categories carry the gender; sub-categories belong to one
-- category. The old spec groupings are retired, not deleted.

alter table public.categories
  add column if not exists gender text check (gender is null or gender in ('men', 'women', 'teenage', 'kid', 'toddler', 'infant')),
  add column if not exists active boolean not null default true;

update public.categories set active = false where gender is null;   -- old groups + gender holders

insert into public.categories (slug, name, sort_order, gender) values
  ('men-t-shirts', 'T-Shirts', 10, 'men'), ('men-polo-shirts', 'Polo Shirts', 11, 'men'), ('men-shirts', 'Shirts', 12, 'men'),
  ('men-shorts', 'Shorts', 13, 'men'), ('men-pants-trousers', 'Pants & Trousers', 14, 'men'), ('men-jeans', 'Jeans', 15, 'men'),
  ('men-activewear-sports-top', 'Activewear Sports Top', 16, 'men'), ('men-activewear-sports-bottom', 'Activewear Sports Bottom', 17, 'men'),
  ('men-compression-wear', 'Compression Wear', 18, 'men'), ('men-sweaters-hoodies', 'Sweaters & Hoodies', 19, 'men'), ('men-jackets-coats', 'Jackets & Coats', 20, 'men'),
  ('women-tops-blouses', 'Tops & Blouses', 30, 'women'), ('women-dresses-jumpsuits', 'Dresses & Jumpsuits', 31, 'women'), ('women-jeans', 'Jeans', 32, 'women'),
  ('women-pants-trousers', 'Pants & Trousers', 33, 'women'), ('women-skirts', 'Skirts', 34, 'women'), ('women-t-shirts', 'T-Shirts', 35, 'women'),
  ('women-polo-shirts', 'Polo Shirts', 36, 'women'), ('women-shorts', 'Shorts', 37, 'women'), ('women-activewear-sports-top', 'Activewear Sports Top', 38, 'women'),
  ('women-activewear-sports-bottom', 'Activewear Sports Bottom', 39, 'women'), ('women-compression-wear', 'Compression Wear', 40, 'women'),
  ('women-nightwear', 'Nightwear', 41, 'women'), ('women-shirts', 'Shirts', 42, 'women'), ('women-waistcoats', 'Waistcoats', 43, 'women'),
  ('women-sweaters-hoodies', 'Sweaters & Hoodies', 44, 'women'), ('women-jackets-coats', 'Jackets & Coats', 45, 'women'),
  ('kid-tops', 'Tops', 60, 'kid'), ('kid-bottoms', 'Bottoms', 61, 'kid'), ('kid-dresses-skirts', 'Dresses & Skirts', 62, 'kid'),
  ('kid-sweaters-hoodies', 'Sweaters & Hoodies', 63, 'kid'), ('kid-jackets-coats', 'Jackets & Coats', 64, 'kid')
on conflict (slug) do nothing;

-- Re-home every existing sub-category by its name and old group.
update public.sub_categories s set category_slug = coalesce((
  select case
    when s.gender = 'kid' then case
      when n ~ '(dress|skirt)' then 'kid-dresses-skirts'
      when n ~ '(puffer|jacket)' then 'kid-jackets-coats'
      when n ~ '(hoodie|sweater|sweatshirt)' then 'kid-sweaters-hoodies'
      when n ~ '(shorts|trousers|sweatpants)' then 'kid-bottoms'
      else 'kid-tops' end
    else g || '-' || case
      when n ~ 'palazzo' then 'pants-trousers'
      when n ~ 'pajama' then 'nightwear'
      when n ~ 'sports bra' then 'activewear-sports-top'
      when n ~ 'sports' and n ~ '(sweatpants|shorts)' then 'activewear-sports-bottom'
      when n ~ 'sports' then 'activewear-sports-top'
      when s.category_slug ~ 'sports' and n ~ 'long sleeve' then 'activewear-sports-top'
      when n ~ '(coat|puffer|blazer|bomber|denim jacket|windbreaker|leather jacket)' then 'jackets-coats'
      when n ~ '(sweater|sweatshirt|hoodie|zip-up)' then 'sweaters-hoodies'
      when n ~ 'polo' then 'polo-shirts'
      when n ~ 't-shirt' then 't-shirts'
      when n ~ 'button-down' then 'shirts'
      when n ~ 'jeans' then 'jeans'
      when n ~ 'shorts' then 'shorts'
      when n ~ '(pants|chinos|trousers)' then 'pants-trousers'
      when n ~ 'dress' then 'dresses-jumpsuits'
      when n ~ 'skirt' then 'skirts'
      when n ~ '(blouse|top)' then 'tops-blouses'
      else 't-shirts' end
  end
  from (select lower(s.name) as n, case when s.gender in ('men','women') then s.gender else 'women' end as g) x
), s.category_slug)
where exists (select 1 from public.categories c where c.gender is not null);

-- Women's "Dress" lands in dresses; men's names never say dress except "dress pants" (handled above).
