-- Two tagging channels (outlet, online), outlet destinations, photos, and
-- the Shopify link per garment.

-- ---------------------------------------------------------------- outlets
alter table public.outlets add column if not exists city text;
update public.outlets set city = 'Online' where is_online and city is null;

-- ------------------------------------------------------------------ items
alter table public.items
  -- outlet: quick tag for the shelf. online: full listing for Shopify.
  add column if not exists channel            text not null default 'outlet' check (channel in ('outlet', 'online')),
  -- [{ path, url, kind: 'original'|'cutout', width, height, bytes, taken_at }]
  add column if not exists photos             jsonb not null default '[]'::jsonb,
  add column if not exists description        text,
  add column if not exists shopify_product_id text,
  add column if not exists shopify_handle     text,
  add column if not exists shopify_tags       text[],
  add column if not exists shopify_synced_at  timestamptz,
  add column if not exists shopify_error      text,
  -- online lifecycle: draft (tagged), ready (photographed + shelved), listed (on Shopify), unlisted
  add column if not exists online_status      text check (online_status is null or online_status in ('draft', 'ready', 'listed', 'unlisted'));

create index if not exists items_channel_idx on public.items (channel, online_status);
create index if not exists items_shopify_idx on public.items (shopify_product_id);

-- ---------------------------------------------------------------- photos
-- Supabase Storage bucket for garment photos. Public read so Shopify can
-- fetch image URLs; writes only for signed-in staff.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garments', 'garments', true, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "garments public read" on storage.objects for select to public using (bucket_id = 'garments');
create policy "garments staff write" on storage.objects for insert to authenticated with check (bucket_id = 'garments');
create policy "garments staff update" on storage.objects for update to authenticated using (bucket_id = 'garments');
create policy "garments staff delete" on storage.objects for delete to authenticated using (bucket_id = 'garments');

-- ------------------------------------------------------- the five outlets
-- Named by city and number until real area names are chosen; rename in the
-- dashboard or a later migration. Two Karachi, one Islamabad, two Lahore.
insert into public.outlets (name, city, is_online) values
  ('Karachi 1', 'Karachi', false),
  ('Karachi 2', 'Karachi', false),
  ('Islamabad', 'Islamabad', false),
  ('Lahore 1', 'Lahore', false),
  ('Lahore 2', 'Lahore', false)
on conflict (name) do nothing;
