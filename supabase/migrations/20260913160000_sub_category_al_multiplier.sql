-- The affordable-luxury multiple lives on each sub-category (13 Sep): blank means
-- the constant on Pricing → Constants. It multiplies the Premium price.
alter table public.sub_categories add column if not exists affordable_luxury_multiplier numeric
  check (affordable_luxury_multiplier is null or affordable_luxury_multiplier > 0);
