-- Why a piece is a rare find: reason codes (see lib/pricing/rare-reasons.ts),
-- each with a short line for the tag and a fuller paragraph for the web.
alter table public.items add column if not exists rare_reasons text[] not null default '{}';
