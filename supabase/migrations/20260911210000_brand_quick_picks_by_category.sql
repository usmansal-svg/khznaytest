-- Quick-pick brand buttons per category on the tag form. Keyed by category
-- name so one "T-Shirts" list serves every gender's T-Shirts category. The
-- general list (brands.quick_pick_order) stays as the fallback.
create table if not exists public.brand_quick_picks (
  category_name text not null,
  brand_id integer not null references public.brands(id) on delete cascade,
  position integer not null,
  primary key (category_name, brand_id)
);
create index if not exists brand_quick_picks_cat_idx on public.brand_quick_picks (category_name, position);

-- Starter lists from Usman (11 Sep). Brands that were not on the list are
-- added as High street, except the known affordable-luxury ones.
insert into public.brands (name, tier, active, source) values
  ('Puma', 'regular', true, 'admin'), ('Gymshark', 'regular', true, 'admin'), ('Lululemon', 'affordable_luxury', true, 'admin'),
  ('Russell Athletic', 'regular', true, 'admin'), ('Izod', 'regular', true, 'admin'), ('Old Navy', 'regular', true, 'admin'),
  ('Levi''s', 'regular', true, 'admin'), ('Timberland', 'regular', true, 'admin'), ('Diesel', 'affordable_luxury', true, 'admin'),
  ('Marks & Spencer', 'regular', true, 'admin')
on conflict (name) do nothing;

insert into public.brand_quick_picks (category_name, brand_id, position)
select c.cat, b.id, c.pos from (values
  ('Activewear Sports Top', 'Nike', 1), ('Activewear Sports Top', 'Adidas', 2), ('Activewear Sports Top', 'Puma', 3), ('Activewear Sports Top', 'Under Armour', 4),
  ('Activewear Sports Top', 'Gymshark', 5), ('Activewear Sports Top', 'Lululemon', 6), ('Activewear Sports Top', 'Russell Athletic', 7), ('Activewear Sports Top', 'Izod', 8), ('Activewear Sports Top', 'Old Navy', 9),
  ('Activewear Sports Bottom', 'Nike', 1), ('Activewear Sports Bottom', 'Adidas', 2), ('Activewear Sports Bottom', 'Puma', 3), ('Activewear Sports Bottom', 'Under Armour', 4),
  ('Activewear Sports Bottom', 'Gymshark', 5), ('Activewear Sports Bottom', 'Lululemon', 6), ('Activewear Sports Bottom', 'Russell Athletic', 7), ('Activewear Sports Bottom', 'Izod', 8), ('Activewear Sports Bottom', 'Old Navy', 9),
  ('T-Shirts', 'Levi''s', 1), ('T-Shirts', 'Timberland', 2), ('T-Shirts', 'Hugo Boss', 3), ('T-Shirts', 'Diesel', 4),
  ('Shirts', 'Calvin Klein', 1), ('Shirts', 'Marks & Spencer', 2), ('Shirts', 'Zara', 3), ('Shirts', 'H&M', 4), ('Shirts', 'Uniqlo', 5), ('Shirts', 'Ralph Lauren', 6), ('Shirts', 'Hugo Boss', 7)
) as c(cat, brand, pos)
join public.brands b on b.name = c.brand
on conflict do nothing;
