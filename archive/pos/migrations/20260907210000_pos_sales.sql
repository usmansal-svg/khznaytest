-- Point of sale: one row per receipt, one row per garment sold.

create table public.sales (
  id             bigint generated always as identity primary key,
  receipt_no     text not null unique,
  outlet_id      bigint references public.outlets (id),
  cashier_id     bigint references public.staff (id),
  sold_at        timestamptz not null default now(),
  subtotal       int not null check (subtotal >= 0),
  discount       int not null default 0 check (discount >= 0),
  total          int not null check (total >= 0),
  payment_method text not null check (payment_method in ('cash', 'card', 'jazzcash', 'easypaisa', 'bank_transfer')),
  tendered       int,
  change_due     int,
  payment_ref    text,
  customer_phone text,
  note           text
);

create index sales_sold_at_idx on public.sales (sold_at desc);
create index sales_outlet_idx  on public.sales (outlet_id, sold_at desc);

create table public.sale_items (
  id          bigint generated always as identity primary key,
  sale_id     bigint not null references public.sales (id) on delete cascade,
  item_id     bigint not null unique references public.items (id),
  list_price  int not null,
  sold_price  int not null check (sold_price >= 0),
  sold_stage  text not null check (sold_stage in ('full', 'md1', 'md2', 'md3'))
);

create index sale_items_sale_idx on public.sale_items (sale_id);

-- Receipt numbers: KHZ-YYYYMMDD-0001, counted per day, server-side.
create table public.receipt_counter (
  day date primary key,
  seq int not null default 0
);

-- Atomic checkout: every line must still be unsold, otherwise nothing is
-- written. Lines arrive as [{item_id, sold_price, sold_stage}].
create or replace function public.checkout_sale(
  p_lines          jsonb,
  p_payment_method text,
  p_discount       int default 0,
  p_tendered       int default null,
  p_payment_ref    text default null,
  p_customer_phone text default null,
  p_note           text default null,
  p_outlet_id      bigint default null
)
returns table (sale_id bigint, receipt_no text, total int, change_due int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq        int;
  v_receipt    text;
  v_subtotal   int;
  v_total      int;
  v_change     int;
  v_sale_id    bigint;
  v_cashier_id bigint;
  v_line       jsonb;
  v_updated    int;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'A sale needs at least one item.';
  end if;

  select coalesce(sum((l->>'sold_price')::int), 0) into v_subtotal
  from jsonb_array_elements(p_lines) l;

  v_total := v_subtotal - coalesce(p_discount, 0);
  if v_total < 0 then
    raise exception 'Discount exceeds the subtotal.';
  end if;

  if p_payment_method = 'cash' then
    if p_tendered is null or p_tendered < v_total then
      raise exception 'Cash tendered is less than the total.';
    end if;
    v_change := p_tendered - v_total;
  end if;

  select id into v_cashier_id from public.staff where auth_user_id = auth.uid();

  insert into public.receipt_counter (day, seq) values (current_date, 1)
  on conflict (day) do update set seq = public.receipt_counter.seq + 1
  returning seq into v_seq;
  v_receipt := 'KHZ-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.sales (receipt_no, outlet_id, cashier_id, subtotal, discount, total,
                            payment_method, tendered, change_due, payment_ref, customer_phone, note)
  values (v_receipt, p_outlet_id, v_cashier_id, v_subtotal, coalesce(p_discount, 0), v_total,
          p_payment_method, p_tendered, v_change, p_payment_ref, p_customer_phone, p_note)
  returning id into v_sale_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    -- Lock the row and refuse if it has been sold since the cart was built.
    update public.items i
       set status = 'sold',
           sold_at = now(),
           sold_price = (v_line->>'sold_price')::int,
           sold_stage = v_line->>'sold_stage'
     where i.id = (v_line->>'item_id')::bigint
       and i.status in ('tagged', 'on_floor', 'set_aside');
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'Item % is no longer available.', v_line->>'item_id';
    end if;

    insert into public.sale_items (sale_id, item_id, list_price, sold_price, sold_stage)
    values (v_sale_id, (v_line->>'item_id')::bigint,
            (select coalesce(price_manual, price) from public.items where id = (v_line->>'item_id')::bigint),
            (v_line->>'sold_price')::int, v_line->>'sold_stage');
  end loop;

  return query select v_sale_id, v_receipt, v_total, v_change;
end;
$$;

revoke all on function public.checkout_sale(jsonb, text, int, int, text, text, text, bigint) from public;
grant execute on function public.checkout_sale(jsonb, text, int, int, text, text, text, bigint) to authenticated;

alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.receipt_counter enable row level security;

create policy "read" on public.sales      for select to authenticated using (true);
create policy "read" on public.sale_items for select to authenticated using (true);
-- Writes go only through checkout_sale(); the counter is never read directly.
