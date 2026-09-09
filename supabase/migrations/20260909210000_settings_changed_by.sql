-- Who saved each settings version (staff, via PIN session).
alter table public.settings add column if not exists changed_by bigint references public.staff (id);
