-- QC as review, not regrade: the reviewer sees what the tagger entered and
-- either approves it or corrects it. Every correction is recorded against
-- the tagger, for the monthly scorecard.
create table if not exists public.qc_reviews (
  id           bigint generated always as identity primary key,
  item_id      bigint not null references public.items(id),
  tagger_id    bigint references public.staff(id),
  reviewed_by  bigint not null references public.staff(id),
  reviewed_at  timestamptz not null default now(),
  method       text not null default 'physical' check (method in ('physical', 'photo')),
  outcome      text not null check (outcome in ('correct', 'corrected')),
  corrections  jsonb not null default '[]'::jsonb,   -- [{field, from, to}]
  price_before int,
  price_after  int,
  note         text
);
create index if not exists qc_reviews_tagger_idx on public.qc_reviews (tagger_id, reviewed_at desc);
create index if not exists qc_reviews_item_idx on public.qc_reviews (item_id);

-- Month-end scores, finalised by a manager with a note.
create table if not exists public.tagger_scores (
  month        date not null,           -- first day of the month
  staff_id     bigint not null references public.staff(id),
  score        int not null,
  target_pct   int not null,
  accuracy_pct int not null,
  tagged       int not null,
  reviewed     int not null,
  corrected    int not null,
  note         text,
  finalised_by bigint references public.staff(id),
  finalised_at timestamptz not null default now(),
  primary key (month, staff_id)
);
