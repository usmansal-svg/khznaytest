-- Per-person screen permissions (14 Sep 2026). Null = the role's default set;
-- a list replaces it. Keys are the screens in lib/auth/permissions.ts.
alter table public.staff add column if not exists permissions text[];
