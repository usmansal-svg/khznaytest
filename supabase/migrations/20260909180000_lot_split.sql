-- A parent lot that has been split into weighed piles: costs sit on it,
-- tagging happens from its children.
alter table public.lots drop constraint if exists lots_status_check;
alter table public.lots add constraint lots_status_check check (status in ('open', 'closed', 'split'));
