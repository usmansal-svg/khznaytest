-- The affordable-luxury uplift is a constant Usman sets, not a number in code (13 Sep).
alter table public.settings
  add column if not exists affordable_luxury_multiplier numeric not null default 2.0 check (affordable_luxury_multiplier > 0),
  add column if not exists affordable_luxury_share      numeric not null default 0.05 check (affordable_luxury_share >= 0 and affordable_luxury_share < 1);
