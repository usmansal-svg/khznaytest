-- Garments can be put on Shopify for the outlets' Shopify POS without being on
-- the website: visibility per garment, and each outlet's Shopify location so
-- its POS sees the stock.
alter table public.items add column if not exists shopify_visibility text
  check (shopify_visibility is null or shopify_visibility in ('draft', 'pos', 'online', 'both'));
alter table public.outlets add column if not exists shopify_location_id text;
