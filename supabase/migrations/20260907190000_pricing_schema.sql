-- Khazanay pricing system — schema (build spec Part Two, section 11).
--
-- Reference tables are readable by any signed-in user and writable only by
-- managers/founders. Operational tables are writable by any signed-in staff.
-- The SKU counter is only ever touched through next_sku_seq(), which is
-- atomic — duplicate SKUs are the one thing records cannot recover from.

-- --------------------------------------------------------------- settings
-- Versioned: every change inserts a new row. Items stamp the version they
-- were priced under so a price can be explained six months later.

create table public.settings (
  version                int primary key,
  fx                     numeric not null,
  blended_rate           numeric not null,
  duty_per_kg            numeric not null,
  sorting_per_piece      numeric not null default 0,
  input_tax_rate         numeric not null,
  input_tax_recover      numeric not null,
  sales_tax              numeric not null,
  target_gp              numeric not null,
  rejected_share         numeric not null,
  bulk_recovery          numeric not null,
  charm_step             int     not null,
  charm_end              int     not null,
  min_price              int     not null,
  ladder_depths          numeric[] not null,
  ladder_months          int[]     not null,
  brand_feedback_enabled boolean not null default false,
  high_value_threshold   int     not null,
  note                   text,
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users (id)
);

create view public.current_settings
  with (security_invoker = true) as
  select * from public.settings order by version desc limit 1;

-- ----------------------------------------------------------------- grades

create table public.grades (
  code            text primary key,
  name            text not null,
  multiplier      numeric not null,
  share_of_intake numeric not null,
  sort_order      int not null
);

-- --------------------------------------------------------------- profiles
-- The multiple is computed from these plus settings, never stored.

create table public.profiles (
  code         text primary key,
  name         text not null,
  pulled_share numeric not null,
  vol_full     numeric not null,
  vol_promo    numeric not null default 0,
  vol_md1      numeric not null,
  vol_md2      numeric not null,
  vol_md3      numeric not null
);

-- ------------------------------------------------------------- categories

create table public.categories (
  slug       text primary key,
  name       text not null,
  sort_order int not null
);

create table public.sub_categories (
  slug            text primary key,
  category_slug   text not null references public.categories (slug),
  name            text not null,
  weight_kg       numeric not null check (weight_kg > 0),
  profile_code    text not null references public.profiles (code),
  value_index     numeric not null check (value_index > 0),
  measure_type    text not null check (measure_type in
                    ('top', 'bottom', 'dress', 'outer', 'kids_top', 'kids_bottom')),
  market_ceiling  int,
  market_price    int,
  per_piece_cost  numeric,
  per_piece_share numeric not null default 0 check (per_piece_share between 0 and 1),
  active          boolean not null default true
);

create index sub_categories_category_idx on public.sub_categories (category_slug);

-- ----------------------------------------------------------------- brands

create table public.brands (
  id     bigint generated always as identity primary key,
  name   text not null unique,
  tier   text not null check (tier in ('regular', 'affordable_luxury', 'ultra_luxury')),
  active boolean not null default true
);

-- Prefix search for the tagging form's datalist.
create index brands_lower_name_idx on public.brands (lower(name) text_pattern_ops);

-- ---------------------------------------------------------------- outlets

create table public.outlets (
  id        bigint generated always as identity primary key,
  name      text not null unique,
  is_online boolean not null default false,
  active    boolean not null default true
);

-- ------------------------------------------------------------------ staff
-- The spec calls this `users`; renamed to avoid confusion with auth.users.
-- Sign-in is Supabase auth; this row carries the role and home outlet.

create table public.staff (
  id           bigint generated always as identity primary key,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name         text not null,
  role         text not null check (role in ('tagger', 'qc_senior', 'manager', 'founder')),
  outlet_id    bigint references public.outlets (id),
  active       boolean not null default true
);

-- ---------------------------------------------------------------- helpers
-- Defined after staff: SQL-language functions are validated at creation and
-- would fail if the table did not exist yet.

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where auth_user_id = auth.uid()
      and active
      and role in ('manager', 'founder')
  );
$$;

-- ------------------------------------------------------------------- lots

create table public.lots (
  id             bigint generated always as identity primary key,
  code           text not null unique,
  supplier       text not null,
  arrived_on     date,
  kg             numeric,
  rate_usd_per_kg numeric,
  pieces_per_kg  numeric,
  notes          text,
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------------ items

create table public.items (
  id               bigint generated always as identity primary key,
  sku              text not null unique,
  lot_id           bigint references public.lots (id),
  outlet_id        bigint references public.outlets (id),
  tagged_by        bigint references public.staff (id),
  tagged_at        timestamptz not null default now(),

  sub_category_slug text not null references public.sub_categories (slug),
  brand_id         bigint references public.brands (id),
  brand_text       text,
  brand_tier       text not null check (brand_tier in ('regular', 'affordable_luxury', 'ultra_luxury')),

  grade_code       text not null references public.grades (code),
  is_rare          boolean not null default false,
  is_unsure        boolean not null default false,
  flaw_note        text,

  season           text check (season in ('summer', 'winter', 'all_season')),
  wearer           text check (wearer in ('men', 'women', 'boy', 'girl', 'infant', 'unisex')),
  size_label       text,
  colour           text,
  fabric           text,
  measurements     jsonb not null default '{}'::jsonb,

  adjustment       text not null default 'standard' check (adjustment in ('below', 'standard', 'above')),

  colour_tag       text check (colour_tag in ('red', 'blue', 'green', 'yellow')),
  floored_on       date,

  landed_cost      numeric not null,
  price            int,
  price_manual     int,
  settings_version int not null references public.settings (version),

  status           text not null default 'tagged'
                     check (status in ('tagged', 'on_floor', 'sold', 'pulled', 'set_aside')),
  sold_at          timestamptz,
  sold_price       int,
  sold_stage       text check (sold_stage in ('full', 'md1', 'md2', 'md3')),

  constraint items_price_or_manual check (price is not null or price_manual is not null)
);

create index items_status_idx        on public.items (status);
create index items_outlet_idx        on public.items (outlet_id);
create index items_sub_category_idx  on public.items (sub_category_slug);
create index items_brand_idx         on public.items (brand_id);
create index items_colour_tag_idx    on public.items (colour_tag, floored_on);

-- ----------------------------------------------------------- grade audits

create table public.grade_audits (
  id             bigint generated always as identity primary key,
  item_id        bigint not null references public.items (id),
  original_grade text not null references public.grades (code),
  audit_grade    text not null references public.grades (code),
  audited_by     bigint references public.staff (id),
  audited_at     timestamptz not null default now(),
  note           text
);

create index grade_audits_item_idx on public.grade_audits (item_id);

-- ------------------------------------------------------------ sku counter
-- The one hard requirement: server-side and atomic.

create table public.sku_counter (
  year int primary key,
  seq  int not null default 0
);

create or replace function public.next_sku_seq()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_seq  int;
begin
  insert into public.sku_counter (year, seq) values (v_year, 1)
  on conflict (year) do update set seq = public.sku_counter.seq + 1
  returning seq into v_seq;
  return v_seq;
end;
$$;

revoke all on function public.next_sku_seq() from public;
grant execute on function public.next_sku_seq() to authenticated;

-- -------------------------------------------------------------------- RLS

alter table public.settings       enable row level security;
alter table public.grades         enable row level security;
alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.sub_categories enable row level security;
alter table public.brands         enable row level security;
alter table public.outlets        enable row level security;
alter table public.staff          enable row level security;
alter table public.lots           enable row level security;
alter table public.items          enable row level security;
alter table public.grade_audits   enable row level security;
alter table public.sku_counter    enable row level security;

-- Reference data: everyone signed in reads; managers write.
create policy "read"  on public.settings       for select to authenticated using (true);
create policy "write" on public.settings       for all    to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "read"  on public.grades         for select to authenticated using (true);
create policy "write" on public.grades         for all    to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "read"  on public.profiles       for select to authenticated using (true);
create policy "write" on public.profiles       for all    to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "read"  on public.categories     for select to authenticated using (true);
create policy "write" on public.categories     for all    to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "read"  on public.sub_categories for select to authenticated using (true);
create policy "write" on public.sub_categories for all    to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "read"  on public.brands         for select to authenticated using (true);
create policy "write" on public.brands         for all    to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "read"  on public.outlets        for select to authenticated using (true);
create policy "write" on public.outlets        for all    to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "read"  on public.staff          for select to authenticated using (true);
create policy "write" on public.staff          for all    to authenticated using (public.is_manager()) with check (public.is_manager());

-- Operational data: any signed-in staff.
create policy "all" on public.lots         for all to authenticated using (true) with check (true);
create policy "all" on public.items        for all to authenticated using (true) with check (true);
create policy "all" on public.grade_audits for all to authenticated using (true) with check (true);

-- The counter is reached only through next_sku_seq(); no direct access.
create policy "read" on public.sku_counter for select to authenticated using (public.is_manager());
