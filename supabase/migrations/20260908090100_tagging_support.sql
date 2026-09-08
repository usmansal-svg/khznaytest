-- Tagging platform support: staff bootstrap, admin audit trail, and the
-- temporary anon reads the sidebar and tag form need before logins exist.

-- ---------------------------------------------------------- ensure_staff
-- Returns the staff row for the signed-in user, creating it on first use.
-- The very first staff member becomes founder so the admin sidebar is
-- reachable without a manual database edit; everyone after is a tagger
-- until a manager promotes them.

create or replace function public.ensure_staff()
returns public.staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_row  public.staff;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;

  select * into v_row from public.staff where auth_user_id = v_uid;
  if found then
    return v_row;
  end if;

  select coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1))
    into v_name from auth.users where id = v_uid;

  insert into public.staff (auth_user_id, name, role)
  values (v_uid, coalesce(v_name, 'staff'),
          case when exists (select 1 from public.staff) then 'tagger' else 'founder' end)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.ensure_staff() from public;
grant execute on function public.ensure_staff() to authenticated;

-- ---------------------------------------------------------- admin_audits
-- Every change made through the pricing sidebar writes one row. A silently
-- edited multiplier is very hard to find later (spec 12.7).

create table public.admin_audits (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_key    text not null,
  before     jsonb,
  after      jsonb,
  changed_by bigint references public.staff (id),
  changed_at timestamptz not null default now(),
  note       text
);

create index admin_audits_table_idx on public.admin_audits (table_name, changed_at desc);

alter table public.admin_audits enable row level security;
create policy "read"  on public.admin_audits for select to authenticated using (public.is_manager());
create policy "write" on public.admin_audits for insert to authenticated with check (true);

-- ------------------------------------------------- TEMPORARY anon reads
-- Reference data only (no items, no sales), so the tag form and pricing
-- sidebar render before a login exists. Drop these policies before
-- production use, together with 20260907220000_pos_anon_temp.sql.

create policy "temp_anon_read" on public.settings   for select to anon using (true);
create policy "temp_anon_read" on public.grades     for select to anon using (true);
create policy "temp_anon_read" on public.profiles   for select to anon using (true);
create policy "temp_anon_read" on public.categories for select to anon using (true);
create policy "temp_anon_read" on public.outlets    for select to anon using (true);
create policy "temp_anon_read" on public.lots       for select to anon using (true);
