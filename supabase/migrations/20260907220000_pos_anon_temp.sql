-- TEMPORARY: lets the till run without a login for a look around.
-- Remove (drop these policies and revoke) before any production deploy.

create policy "temp_anon_read" on public.items          for select to anon using (true);
create policy "temp_anon_read" on public.brands         for select to anon using (true);
create policy "temp_anon_read" on public.sub_categories for select to anon using (true);
create policy "temp_anon_read" on public.sales          for select to anon using (true);
create policy "temp_anon_read" on public.sale_items     for select to anon using (true);
grant execute on function public.checkout_sale(jsonb, text, int, int, text, text, text, bigint) to anon;

-- Two demo garments so there is something to scan: DEMO-1 at full price,
-- DEMO-2 floored two months ago so it rings up at half price.
insert into public.lots (code, supplier) values ('DEMO', 'demo') on conflict (code) do nothing;
insert into public.items (sku, lot_id, sub_category_slug, brand_text, brand_tier, grade_code, size_label,
                          landed_cost, price, settings_version, status, floored_on)
select 'DEMO-1', l.id, (select slug from public.sub_categories order by slug limit 1), 'Zara', 'regular', 'premium', 'M',
       100, 1490, 1, 'on_floor', current_date
from public.lots l where l.code = 'DEMO'
union all
select 'DEMO-2', l.id, (select slug from public.sub_categories order by slug limit 1), 'H&M', 'regular', 'excellent', 'L',
       100, 990, 1, 'on_floor', current_date - interval '2 months'
from public.lots l where l.code = 'DEMO'
on conflict (sku) do nothing;
