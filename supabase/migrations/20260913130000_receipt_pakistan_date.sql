-- Receipt numbers (KHZ-YYYYMMDD-0001) and the per-day counter use the
-- Pakistan date, not the server's UTC date: a sale at 03:00 in Karachi was
-- numbered under the previous day. Same function as pos_v2, one line changed.
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
  v_day date := (now() at time zone 'Asia/Karachi')::date;
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

  insert into public.receipt_counter (day, seq) values (v_day, 1)
  on conflict (day) do update set seq = public.receipt_counter.seq + 1
  returning seq into v_seq;
  v_receipt := 'KHZ-' || to_char(v_day, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

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
