-- Minimum condition that may go to an outlet. A garment tagged for the
-- outlet channel below this grade is saved as online stock instead, and
-- transfers refuse it. Default: Excellent (Very Good stays out of outlets).
alter table public.settings
  add column if not exists outlet_min_grade text not null default 'excellent'
  check (outlet_min_grade in ('bnwt', 'premium', 'excellent', 'very_good'));
