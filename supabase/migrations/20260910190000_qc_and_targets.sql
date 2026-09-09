-- QC that fits stock leaving on the day: a random sample per shipment is
-- regraded blind at the outlet on receipt; photos can be reviewed from
-- anywhere. Daily tagging targets per tagger.

alter table public.grade_audits
  add column if not exists method      text not null default 'physical' check (method in ('physical', 'photo')),
  add column if not exists transfer_id bigint references public.transfers (id),
  add column if not exists price_delta int;                          -- audit price minus original price

alter table public.transfer_items add column if not exists qc boolean not null default false;
create index if not exists transfer_items_qc_idx on public.transfer_items (transfer_id) where qc;
create index if not exists grade_audits_audited_idx on public.grade_audits (audited_at desc);

alter table public.staff add column if not exists daily_target int check (daily_target is null or daily_target > 0);
alter table public.settings add column if not exists default_daily_target int not null default 60;
