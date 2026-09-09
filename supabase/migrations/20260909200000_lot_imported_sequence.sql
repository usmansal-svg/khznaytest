-- Imported lots pay duty on weight and carry a reclaimable input-tax
-- credit; local purchases carry neither, so their cost is what was paid.
alter table public.lots add column if not exists imported boolean not null default true;

-- Lot codes are issued in sequence, never typed: LOT-0001, LOT-0002, …
create table if not exists public.lot_counter (id int primary key default 1 check (id = 1), seq int not null default 0);
insert into public.lot_counter (id, seq) values (1, 0) on conflict (id) do nothing;

create or replace function public.next_lot_seq()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v int;
begin
  update public.lot_counter set seq = seq + 1 where id = 1 returning seq into v;
  return v;
end;
$$;
revoke all on function public.next_lot_seq() from public;
grant execute on function public.next_lot_seq() to authenticated, service_role;
alter table public.lot_counter enable row level security;
