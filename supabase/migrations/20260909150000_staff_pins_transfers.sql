-- Name + PIN sign-in on shared iPads (spec: "a PIN is faster than a password
-- and enough"), and transfers of tagged garments to outlets.

-- ------------------------------------------------------------------ staff
alter table public.staff
  add column if not exists pin_hash    text,
  add column if not exists pin_set_at  timestamptz,
  add column if not exists last_login  timestamptz;

-- A staff row no longer needs a Supabase auth user behind it.
alter table public.staff alter column auth_user_id drop not null;

-- -------------------------------------------------------------- transfers
-- A shipment of tagged garments from the tagging station to an outlet.
create table if not exists public.transfers (
  id            bigint generated always as identity primary key,
  code          text not null unique,               -- TRF-YYYYMMDD-0001
  to_outlet_id  bigint not null references public.outlets (id),
  from_outlet_id bigint references public.outlets (id),
  status        text not null default 'open' check (status in ('open', 'sent', 'received')),
  created_by    bigint references public.staff (id),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  received_at   timestamptz,
  received_by   bigint references public.staff (id),
  note          text
);

create table if not exists public.transfer_items (
  transfer_id bigint not null references public.transfers (id) on delete cascade,
  item_id     bigint not null references public.items (id),
  primary key (transfer_id, item_id)
);

create index if not exists transfers_outlet_idx on public.transfers (to_outlet_id, status);
create index if not exists transfer_items_item_idx on public.transfer_items (item_id);

create table if not exists public.transfer_counter (
  day date primary key,
  seq int not null default 0
);

-- Where a garment physically is, distinct from the outlet it is destined for.
alter table public.items add column if not exists received_at timestamptz;

alter table public.transfers        enable row level security;
alter table public.transfer_items   enable row level security;
alter table public.transfer_counter enable row level security;
create policy "all" on public.transfers      for all to authenticated using (true) with check (true);
create policy "all" on public.transfer_items for all to authenticated using (true) with check (true);
