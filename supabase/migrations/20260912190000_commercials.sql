-- Commercials platform (separate app, same database).
--
-- 1. Vendors as rows: lots group by vendor id, not by a typed supplier name.
-- 2. Lot cost lines: the full landed price of a lot (invoice, freight, duty,
--    clearing …) so gross margin is measured against what was really paid.
-- 3. Stage override / pull request on items: what the commercials desk
--    decides, for the POS and the floor to act on. The markdown clock stays
--    the default; an override wins while it is set.
-- 4. Recommendations queue: sale / hold / pull suggestions, approved or
--    dismissed by a manager.

-- ---------------------------------------------------------------- vendors
create table if not exists public.vendors (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  country    text,
  contact    text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.vendors enable row level security;
drop policy if exists "all" on public.vendors;
create policy "all" on public.vendors for all to authenticated using (true) with check (true);

alter table public.lots add column if not exists vendor_id bigint references public.vendors (id);
create index if not exists lots_vendor_idx on public.lots (vendor_id);

-- Backfill: one vendor per distinct supplier name already on the lots.
insert into public.vendors (name)
select distinct trim(supplier) from public.lots
where supplier is not null and trim(supplier) <> ''
on conflict (name) do nothing;

update public.lots l set vendor_id = v.id
from public.vendors v
where l.vendor_id is null and trim(l.supplier) = v.name;

-- Keep the two in step: a lot created with a typed supplier name gets (or
-- creates) the matching vendor; a lot given a vendor id shows that name.
create or replace function public.lots_sync_vendor()
returns trigger language plpgsql as $$
declare v_id bigint; v_name text;
begin
  if new.vendor_id is not null and (tg_op = 'INSERT' or new.vendor_id is distinct from old.vendor_id) then
    select name into v_name from public.vendors where id = new.vendor_id;
    if v_name is not null then new.supplier := v_name; end if;
    return new;
  end if;
  if new.supplier is not null and trim(new.supplier) <> '' and (new.vendor_id is null or new.supplier is distinct from old.supplier) then
    select id into v_id from public.vendors where name = trim(new.supplier);
    if v_id is null then
      insert into public.vendors (name) values (trim(new.supplier)) returning id into v_id;
    end if;
    new.vendor_id := v_id;
  end if;
  return new;
end $$;

drop trigger if exists lots_sync_vendor on public.lots;
create trigger lots_sync_vendor before insert or update of supplier, vendor_id on public.lots
for each row execute function public.lots_sync_vendor();

-- -------------------------------------------------------------- lot costs
create table if not exists public.lot_costs (
  id         bigint generated always as identity primary key,
  lot_id     bigint not null references public.lots (id) on delete cascade,
  kind       text not null check (kind in ('invoice', 'freight', 'duty', 'clearing', 'transport', 'sorting', 'tax', 'other')),
  amount_pkr numeric not null check (amount_pkr >= 0),
  note       text,
  created_at timestamptz not null default now(),
  created_by bigint references public.staff (id)
);
create index if not exists lot_costs_lot_idx on public.lot_costs (lot_id);
alter table public.lot_costs enable row level security;
drop policy if exists "all" on public.lot_costs;
create policy "all" on public.lot_costs for all to authenticated using (true) with check (true);

-- ------------------------------------------------- item overrides & pulls
alter table public.items
  add column if not exists stage_override text check (stage_override is null or stage_override in ('full', 'md1', 'md2', 'md3')),
  add column if not exists stage_override_at timestamptz,
  add column if not exists pull_requested boolean not null default false,
  add column if not exists pull_destination text check (pull_destination is null or pull_destination in ('outlet', 'online', 'bulk')),
  add column if not exists pull_to_outlet_id bigint references public.outlets (id),
  add column if not exists pull_requested_at timestamptz;
create index if not exists items_pull_idx on public.items (pull_requested) where pull_requested;

comment on column public.items.stage_override is 'Commercials decision: hold the garment at this ladder stage regardless of months on the floor; null = follow the clock';
comment on column public.items.pull_requested is 'Commercials decision: take the garment off the floor at the next sweep';

-- --------------------------------------------------------- recommendations
create table if not exists public.commercial_recommendations (
  id            bigint generated always as identity primary key,
  kind          text not null check (kind in ('markdown', 'hold', 'pull')),
  item_id       bigint not null references public.items (id) on delete cascade,
  lot_id        bigint references public.lots (id),
  outlet_id     bigint references public.outlets (id),
  stage_now     text,
  to_stage      text check (to_stage is null or to_stage in ('full', 'md1', 'md2', 'md3')),
  destination   text check (destination is null or destination in ('outlet', 'online', 'bulk')),
  to_outlet_id  bigint references public.outlets (id),
  reason        text not null,
  age_days      int,
  landed_cost   numeric,
  list_price    int,
  price_now     int,
  price_after   int,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'dismissed', 'superseded')),
  run_at        timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    bigint references public.staff (id)
);
create unique index if not exists commercial_recommendations_open_idx on public.commercial_recommendations (item_id, kind) where status = 'pending';
create index if not exists commercial_recommendations_status_idx on public.commercial_recommendations (status, run_at desc);
create index if not exists commercial_recommendations_lot_idx on public.commercial_recommendations (lot_id);
alter table public.commercial_recommendations enable row level security;
drop policy if exists "all" on public.commercial_recommendations;
create policy "all" on public.commercial_recommendations for all to authenticated using (true) with check (true);
