-- Print jobs for the label printer helper (14 Sep 2026).
-- The tag form or print page queues a job; the helper on the Mac beside the
-- ZYWELL printer claims it, renders the label at the exact paper size and
-- prints it. iPads cannot print to the ZY909 directly and AirPrint sharing
-- from the Mac hides label-sized paper, so this is the reliable route.
create table if not exists public.print_jobs (
  id            bigserial primary key,
  sku           text not null,
  format        text not null default 'label2x1',
  copies        int  not null default 1 check (copies between 1 and 20),
  status        text not null default 'queued' check (status in ('queued', 'printing', 'done', 'error')),
  error         text,
  requested_by  bigint references public.staff (id),
  requested_at  timestamptz not null default now(),
  claimed_at    timestamptz,
  printed_at    timestamptz,
  agent         text
);
create index if not exists print_jobs_queued_idx on public.print_jobs (status, requested_at) where status = 'queued';
alter table public.print_jobs enable row level security;
