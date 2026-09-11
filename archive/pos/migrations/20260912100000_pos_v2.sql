-- Point of sale, second pass: outlet roles, till sessions, returns and voids,
-- a Shopify sold-out queue, and a checkout that knows who sold what where.

-- Roles for the outlets. A cashier and an outlet manager belong to one outlet (staff.outlet_id).
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('tagger', 'qc_senior', 'manager', 'founder', 'photographer', 'cashier', 'outlet_manager'));

-- Sales: who, which till session, and voids.
alter table public.sales
  add column if not exists session_id bigint,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by bigint references public.staff(id),
  add column if not exists void_reason text;
alter table public.sales alter column outlet_id set not null;

-- Lines: price overrides are recorded with a reason; returns live on the line.
alter table public.sale_items
  add column if not exists shelf_price int,
  add column if not exists override_reason text,
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by bigint references public.staff(id),
  add column if not exists return_reason text,
  add column if not exists refund_amount int,
  add column if not exists return_disposition text check (return_disposition is null or return_disposition in ('back_on_floor', 'damaged'));
-- An item can be sold again after a return, so the unique index goes; a partial one keeps double-selling out.
alter table public.sale_items drop constraint if exists sale_items_item_id_key;
create unique index if not exists sale_items_item_open_idx on public.sale_items (item_id) where returned_at is null;

-- Till sessions: opening float, closing count, expected cash.
create table if not exists public.till_sessions (
  id             bigint generated always as identity primary key,
  outlet_id      bigint not null references public.outlets(id),
  opened_by      bigint not null references public.staff(id),
  opened_at      timestamptz not null default now(),
  opening_float  int not null default 0,
  closed_by      bigint references public.staff(id),
  closed_at      timestamptz,
  counted_cash   int,
  expected_cash  int,
  note           text
);
create index if not exists till_sessions_outlet_idx on public.till_sessions (outlet_id, opened_at desc);
alter table public.sales add constraint sales_session_fk foreign key (session_id) references public.till_sessions(id);

-- Shopify sold-out queue: an outlet sale of a listed garment must take it off the website.
create table if not exists public.shopify_sync_queue (
  id          bigint generated always as identity primary key,
  item_id     bigint not null references public.items(id) on delete cascade,
  action      text not null check (action in ('sold_out', 'relist')),
  created_at  timestamptz not null default now(),
  attempts    int not null default 0,
  last_error  text,
  done_at     timestamptz
);
create index if not exists shopify_sync_pending_idx on public.shopify_sync_queue (created_at) where done_at is null;

-- Items: a returned garment can come back to the floor; damaged ones are pulled.
alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check
  check (status in ('tagged', 'on_floor', 'sold', 'pulled', 'set_aside', 'rejected', 'returned_damaged'));

-- Checkout v2: cashier and outlet are explicit (PIN sessions, not auth.uid());
-- every line must be on the floor at this outlet unless the cashier overrides.
drop function if exists public.checkout_sale(jsonb, text, int, int, text, text, text, bigint);
create or replace function public.checkout_sale(
  p_lines            jsonb,
  p_payment_method   text,
  p_outlet_id        bigint,
  p_cashier_id       bigint,
  p_session_id       bigint default null,
  p_discount         int default 0,
  p_tendered         int default null,
  p_payment_ref      text default null,
  p_customer_phone   text default null,
  p_note             text default null,
  p_allow_other_outlet boolean default false
)
returns table (sale_id bigint, receipt_no text, total int, change_due int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int; v_receipt text; v_subtotal int; v_total int; v_change int; v_sale_id bigint;
  v_line jsonb; v_updated int; v_item record;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'A sale needs at least one item.'; end if;
  if p_outlet_id is null then raise exception 'The sale needs an outlet.'; end if;

  select coalesce(sum((l->>'sold_price')::int), 0) into v_subtotal from jsonb_array_elements(p_lines) l;
  v_total := v_subtotal - coalesce(p_discount, 0);
  if v_total < 0 then raise exception 'Discount exceeds the subtotal.'; end if;
  if p_payment_method = 'cash' then
    if p_tendered is null or p_tendered < v_total then raise exception 'Cash tendered is less than the total.'; end if;
    v_change := p_tendered - v_total;
  end if;

  insert into public.receipt_counter (day, seq) values (current_date, 1)
  on conflict (day) do update set seq = public.receipt_counter.seq + 1
  returning seq into v_seq;
  v_receipt := 'KHZ-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.sales (receipt_no, outlet_id, cashier_id, session_id, subtotal, discount, total, payment_method, tendered, change_due, payment_ref, customer_phone, note)
  values (v_receipt, p_outlet_id, p_cashier_id, p_session_id, v_subtotal, coalesce(p_discount, 0), v_total, p_payment_method, p_tendered, v_change, p_payment_ref, p_customer_phone, p_note)
  returning id into v_sale_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select id, sku, status, outlet_id, coalesce(price_manual, price) as list_price into v_item
      from public.items where id = (v_line->>'item_id')::bigint for update;
    if v_item.id is null then raise exception 'Item % does not exist.', v_line->>'item_id'; end if;
    if v_item.status not in ('on_floor', 'tagged') then raise exception '% is %.', v_item.sku, replace(v_item.status, '_', ' '); end if;
    if not p_allow_other_outlet and v_item.outlet_id is distinct from p_outlet_id then
      raise exception '% belongs to another outlet (or has not been received here).', v_item.sku;
    end if;

    update public.items set status = 'sold', sold_at = now(), sold_price = (v_line->>'sold_price')::int, sold_stage = v_line->>'sold_stage',
           outlet_id = coalesce(outlet_id, p_outlet_id)
     where id = v_item.id;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then raise exception '% is no longer available.', v_item.sku; end if;

    insert into public.sale_items (sale_id, item_id, list_price, shelf_price, sold_price, sold_stage, override_reason)
    values (v_sale_id, v_item.id, v_item.list_price, nullif(v_line->>'shelf_price', '')::int, (v_line->>'sold_price')::int, v_line->>'sold_stage', nullif(v_line->>'override_reason', ''));
  end loop;

  return query select v_sale_id, v_receipt, v_total, v_change;
end;
$$;

-- Void a whole receipt: lines back on the floor, receipt kept and marked.
create or replace function public.void_sale(p_sale_id bigint, p_by bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_line record;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Give a reason for the void.'; end if;
  perform 1 from public.sales where id = p_sale_id and voided_at is null for update;
  if not found then raise exception 'Receipt not found or already voided.'; end if;
  for v_line in select item_id from public.sale_items where sale_id = p_sale_id and returned_at is null loop
    update public.items set status = 'on_floor', sold_at = null, sold_price = null, sold_stage = null where id = v_line.item_id and status = 'sold';
    update public.sale_items set returned_at = now(), returned_by = p_by, return_reason = 'void: ' || p_reason, refund_amount = sold_price, return_disposition = 'back_on_floor' where sale_id = p_sale_id and item_id = v_line.item_id;
  end loop;
  update public.sales set voided_at = now(), voided_by = p_by, void_reason = p_reason where id = p_sale_id;
end;
$$;

-- Return one line: refund recorded, garment back on the floor or pulled as damaged.
create or replace function public.return_sale_item(p_sale_item_id bigint, p_by bigint, p_reason text, p_refund int, p_disposition text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item bigint; v_sold int;
begin
  if p_disposition not in ('back_on_floor', 'damaged') then raise exception 'Disposition must be back_on_floor or damaged.'; end if;
  select item_id, sold_price into v_item, v_sold from public.sale_items where id = p_sale_item_id and returned_at is null for update;
  if v_item is null then raise exception 'Line not found or already returned.'; end if;
  if p_refund < 0 or p_refund > v_sold then raise exception 'Refund must be between 0 and the sold price.'; end if;
  update public.sale_items set returned_at = now(), returned_by = p_by, return_reason = p_reason, refund_amount = p_refund, return_disposition = p_disposition where id = p_sale_item_id;
  if p_disposition = 'back_on_floor' then
    update public.items set status = 'on_floor', sold_at = null, sold_price = null, sold_stage = null where id = v_item;
  else
    update public.items set status = 'returned_damaged' where id = v_item;
  end if;
end;
$$;
