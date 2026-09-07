-- A tiny table used by /health to prove the app can actually reach the database.
create table if not exists public.health_check (
  id         bigint generated always as identity primary key,
  label      text        not null,
  created_at timestamptz not null default now()
);

alter table public.health_check enable row level security;

-- The app reads this table with the anon/publishable key, so it needs an
-- explicit read policy. Read-only: nothing here grants insert/update/delete.
drop policy if exists "health_check is publicly readable" on public.health_check;
create policy "health_check is publicly readable"
  on public.health_check
  for select
  to anon, authenticated
  using (true);

insert into public.health_check (label)
select 'connection verified'
where not exists (select 1 from public.health_check);
