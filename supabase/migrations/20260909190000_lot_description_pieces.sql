-- What was bought (description) versus internal remarks (notes), and a
-- piece count so per-piece lots have a quantity to split, track and cost.
alter table public.lots
  add column if not exists description text,
  add column if not exists pieces integer check (pieces is null or pieces > 0);
comment on column public.lots.pieces is 'pieces bought (per-piece lots)';
