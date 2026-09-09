-- QC by random hold-back at tagging: a share of saved garments is marked
-- held; the tagger is told to set it aside; a senior regrades it blind and
-- releases it. Held garments cannot travel until released.
alter table public.items
  add column if not exists qc_hold        boolean not null default false,
  add column if not exists qc_released_at timestamptz;
create index if not exists items_qc_hold_idx on public.items (qc_hold) where qc_hold;
alter table public.settings add column if not exists qc_sample_rate numeric not null default 0.10 check (qc_sample_rate >= 0 and qc_sample_rate <= 1);
