-- Several label printers, one helper each (14 Sep 2026). A job names the
-- printer it is for; a helper announces itself here every few seconds so the
-- print pages can list the printers that are actually up.
alter table public.print_jobs add column if not exists printer text;
create index if not exists print_jobs_printer_queued_idx on public.print_jobs (printer, requested_at) where status = 'queued';
create table if not exists public.label_printers (
  name       text primary key,
  queue      text not null,
  mode       text not null default 'pdf',
  host       text,
  paper      text,
  last_seen  timestamptz not null default now()
);
alter table public.label_printers enable row level security;
