-- The monthly scorecard covers everyone with a KPI, not only taggers (12 Sep):
-- a finalised score is per person, month and kind of work.
alter table public.tagger_scores add column if not exists kind text not null default 'tagging'
  check (kind in ('tagging', 'photography', 'qc'));
alter table public.tagger_scores drop constraint if exists tagger_scores_pkey;
alter table public.tagger_scores add primary key (month, staff_id, kind);
