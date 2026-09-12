-- Shopify products sold at the outlets (13 Sep): shoes, accessories and other
-- stock that lives on Shopify only and was never tagged. The POS syncs, per
-- outlet, the variants stocked at that outlet's Shopify location and published
-- to the Point of Sale channel; the till sells them like garments; every sale,
-- return and void adjusts the local count at once and queues the same
-- adjustment for Shopify (worked right away and by the nightly cron).

create table if not exists public.shopify_products (
  variant_id        text primary key,
  product_id        text not null,
  inventory_item_id text,
  title             text not null,
  variant_title     text,
  sku               text,
  barcode           text,
  price             int not null default 0,
  image_url         text,
  product_type      text,
  vendor            text,
  status            text,
  pos_published     boolean not null default true,
  synced_at         timestamptz not null default now()
);
create index if not exists shopify_products_barcode_idx on public.shopify_products (barcode);
create index if not exists shopify_products_sku_idx on public.shopify_products (sku);
create index if not exists shopify_products_product_idx on public.shopify_products (product_id);

create table if not exists public.shopify_stock (
  variant_id text not null references public.shopify_products (variant_id) on delete cascade,
  outlet_id  bigint not null references public.outlets (id),
  available  int not null default 0,
  synced_at  timestamptz not null default now(),
  primary key (variant_id, outlet_id)
);

-- A sale line is either a tagged garment or a Shopify variant, never both.
alter table public.sale_items alter column item_id drop not null;
alter table public.sale_items add column if not exists shopify_variant_id text references public.shopify_products (variant_id);
alter table public.sale_items drop constraint if exists sale_items_line_kind;
alter table public.sale_items add constraint sale_items_line_kind check ((item_id is not null) <> (shopify_variant_id is not null));
create index if not exists sale_items_variant_idx on public.sale_items (shopify_variant_id);

-- The queue also carries stock adjustments for Shopify variants.
alter table public.shopify_sync_queue alter column item_id drop not null;
alter table public.shopify_sync_queue drop constraint if exists shopify_sync_queue_action_check;
alter table public.shopify_sync_queue add constraint shopify_sync_queue_action_check check (action in ('sold_out', 'relist', 'adjust'));
alter table public.shopify_sync_queue
  add column if not exists variant_id text references public.shopify_products (variant_id) on delete cascade,
  add column if not exists outlet_id  bigint references public.outlets (id),
  add column if not exists delta      int;

alter table public.shopify_products enable row level security;
alter table public.shopify_stock enable row level security;

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
  v_line jsonb; v_updated int; v_item record; v_vid text; v_avail int; v_title text;
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
    v_vid := nullif(v_line->>'shopify_variant_id', '');
    if v_vid is not null then
      -- A Shopify product stocked at this outlet: one unit per line.
      select s.available, p.title into v_avail, v_title
        from public.shopify_stock s join public.shopify_products p on p.variant_id = s.variant_id
       where s.variant_id = v_vid and s.outlet_id = p_outlet_id for update of s;
      if v_avail is null then raise exception 'That Shopify product is not stocked at this outlet.'; end if;
      if v_avail < 1 and not p_allow_other_outlet then raise exception '% is out of stock here (Shopify shows 0).', v_title; end if;
      update public.shopify_stock set available = available - 1 where variant_id = v_vid and outlet_id = p_outlet_id;
      insert into public.sale_items (sale_id, shopify_variant_id, list_price, shelf_price, sold_price, sold_stage, override_reason)
      values (v_sale_id, v_vid, coalesce(nullif(v_line->>'list_price', '')::int, (v_line->>'sold_price')::int), nullif(v_line->>'shelf_price', '')::int, (v_line->>'sold_price')::int, 'full', nullif(v_line->>'override_reason', ''));
      insert into public.shopify_sync_queue (action, variant_id, outlet_id, delta) values ('adjust', v_vid, p_outlet_id, -1);
      continue;
    end if;

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

-- Void a whole receipt: garments back on the floor, Shopify units back in stock (and queued for Shopify), receipt kept and marked.
create or replace function public.void_sale(p_sale_id bigint, p_by bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_line record; v_outlet bigint;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Give a reason for the void.'; end if;
  select outlet_id into v_outlet from public.sales where id = p_sale_id and voided_at is null for update;
  if not found then raise exception 'Receipt not found or already voided.'; end if;
  for v_line in select item_id, shopify_variant_id from public.sale_items where sale_id = p_sale_id and returned_at is null loop
    if v_line.item_id is not null then
      update public.items set status = 'on_floor', sold_at = null, sold_price = null, sold_stage = null where id = v_line.item_id and status = 'sold';
      update public.sale_items set returned_at = now(), returned_by = p_by, return_reason = 'void: ' || p_reason, refund_amount = sold_price, return_disposition = 'back_on_floor' where sale_id = p_sale_id and item_id = v_line.item_id;
    else
      insert into public.shopify_stock (variant_id, outlet_id, available) values (v_line.shopify_variant_id, v_outlet, 1)
        on conflict (variant_id, outlet_id) do update set available = public.shopify_stock.available + 1;
      insert into public.shopify_sync_queue (action, variant_id, outlet_id, delta) values ('adjust', v_line.shopify_variant_id, v_outlet, 1);
      update public.sale_items set returned_at = now(), returned_by = p_by, return_reason = 'void: ' || p_reason, refund_amount = sold_price, return_disposition = 'back_on_floor' where sale_id = p_sale_id and shopify_variant_id = v_line.shopify_variant_id and returned_at is null;
    end if;
  end loop;
  update public.sales set voided_at = now(), voided_by = p_by, void_reason = p_reason where id = p_sale_id;
end;
$$;

-- Return one line: refund recorded; a garment goes back on the floor or is marked damaged; a Shopify unit goes back into stock unless damaged.
create or replace function public.return_sale_item(p_sale_item_id bigint, p_by bigint, p_reason text, p_refund int, p_disposition text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item bigint; v_vid text; v_sold int; v_outlet bigint;
begin
  if p_disposition not in ('back_on_floor', 'damaged') then raise exception 'Disposition must be back_on_floor or damaged.'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Give a reason for the return.'; end if;
  select si.item_id, si.shopify_variant_id, si.sold_price, s.outlet_id into v_item, v_vid, v_sold, v_outlet
    from public.sale_items si join public.sales s on s.id = si.sale_id
   where si.id = p_sale_item_id and si.returned_at is null for update of si;
  if v_item is null and v_vid is null then raise exception 'Line not found or already returned.'; end if;
  if p_refund < 0 or p_refund > v_sold then raise exception 'Refund must be between 0 and the sold price.'; end if;
  update public.sale_items set returned_at = now(), returned_by = p_by, return_reason = p_reason, refund_amount = p_refund, return_disposition = p_disposition where id = p_sale_item_id;
  if v_item is not null then
    if p_disposition = 'damaged' then
      update public.items set status = 'returned_damaged' where id = v_item;
    else
      update public.items set status = 'on_floor', sold_at = null, sold_price = null, sold_stage = null where id = v_item;
    end if;
  elsif p_disposition = 'back_on_floor' then
    insert into public.shopify_stock (variant_id, outlet_id, available) values (v_vid, v_outlet, 1)
      on conflict (variant_id, outlet_id) do update set available = public.shopify_stock.available + 1;
    insert into public.shopify_sync_queue (action, variant_id, outlet_id, delta) values ('adjust', v_vid, v_outlet, 1);
  end if;
end;
$$;
