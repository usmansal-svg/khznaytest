-- Season per sub-category: the tag form shows only the matching catalogue
-- for the season chosen, and the season goes to Shopify as a tag.
alter table public.sub_categories
  add column if not exists season text not null default 'all'
  check (season in ('summer', 'winter', 'all'));

-- Sensible starting values from the names; edit on the pricing sheet.
update public.sub_categories set season = 'winter'
 where lower(name) ~ '(heavy|sweater|sweatshirt|hoodie|zip-up|long coat|puffer|leather jacket|blazer|sweatpants|long sleeve)';
update public.sub_categories set season = 'summer'
 where lower(name) ~ '(shorts|sports bra|tank|vest|swim|sleeveless|crop top|palazzo)';
