-- Atomic per-day transfer numbers: TRF-YYYYMMDD-0001.
create or replace function public.next_transfer_seq(p_day date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_seq int;
begin
  insert into public.transfer_counter (day, seq) values (p_day, 1)
  on conflict (day) do update set seq = public.transfer_counter.seq + 1
  returning seq into v_seq;
  return v_seq;
end;
$$;
revoke all on function public.next_transfer_seq(date) from public;
grant execute on function public.next_transfer_seq(date) to authenticated, service_role;
