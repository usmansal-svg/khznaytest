-- Outlet stock requirements (Commercials app).
--
-- Each outlet has racks; a rack holds one category (optionally one
-- sub-category) up to a capacity. The planner projects, from the outlet's
-- sales rate and the lead time to reach it, when the rack falls under its
-- minimum, and raises a replenishment request early enough to prevent it.

-- ----------------------------------------------------------- lead times
alter table public.outlets add column if not exists transit_days int not null default 2 check (transit_days >= 0);
comment on column public.outlets.transit_days is 'Days from dispatch at HQ to the garments being on this outlet''s floor';

create table if not exists public.replenishment_settings (
  id                 int primary key default 1 check (id = 1),
  prep_days          int not null default 2 check (prep_days >= 0),        -- pick, pack and dispatch at HQ
  sales_window_days  int not null default 28 check (sales_window_days > 0), -- how far back the selling rate looks
  default_min_pct    numeric not null default 0.60 check (default_min_pct > 0 and default_min_pct < 1),
  updated_at         timestamptz not null default now()
);
insert into public.replenishment_settings (id) values (1) on conflict (id) do nothing;
alter table public.replenishment_settings enable row level security;
drop policy if exists "all" on public.replenishment_settings;
create policy "all" on public.replenishment_settings for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------------ racks
create table if not exists public.rack_capacities (
  id                bigint generated always as identity primary key,
  outlet_id         bigint not null references public.outlets (id) on delete cascade,
  category_slug     text not null references public.categories (slug),
  sub_category_slug text references public.sub_categories (slug),
  name              text,                                   -- what staff call it, e.g. "Sports shirts wall"
  capacity          int not null check (capacity > 0),
  min_pct           numeric check (min_pct is null or (min_pct > 0 and min_pct < 1)),  -- null = the default
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
create unique index if not exists rack_capacities_scope_idx on public.rack_capacities (outlet_id, category_slug, coalesce(sub_category_slug, ''));
alter table public.rack_capacities enable row level security;
drop policy if exists "all" on public.rack_capacities;
create policy "all" on public.rack_capacities for all to authenticated using (true) with check (true);

-- --------------------------------------------------------------- requests
create table if not exists public.replenishment_requests (
  id                bigint generated always as identity primary key,
  rack_id           bigint not null references public.rack_capacities (id) on delete cascade,
  outlet_id         bigint not null references public.outlets (id),
  category_slug     text not null,
  sub_category_slug text,
  qty               int not null check (qty > 0),
  send_by           date not null,
  urgency           text not null check (urgency in ('critical', 'order_now', 'soon')),
  reason            text not null,
  hq_available      int not null default 0,
  status            text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  closed_at         timestamptz,
  closed_by         bigint references public.staff (id)
);
create unique index if not exists replenishment_requests_open_idx on public.replenishment_requests (rack_id) where status = 'open';
create index if not exists replenishment_requests_status_idx on public.replenishment_requests (status, send_by);
alter table public.replenishment_requests enable row level security;
drop policy if exists "all" on public.replenishment_requests;
create policy "all" on public.replenishment_requests for all to authenticated using (true) with check (true);
