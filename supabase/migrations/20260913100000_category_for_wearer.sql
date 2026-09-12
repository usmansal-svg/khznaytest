-- Inside a child band, boys and girls share one catalogue; a category can be
-- limited to one of them so a frock is never offered for a boy (13 Sep).
alter table public.categories add column if not exists for_wearer text not null default 'any'
  check (for_wearer in ('any', 'girls', 'boys'));
update public.categories set for_wearer = 'girls'
  where gender in ('teenage', 'kid', 'toddler', 'infant') and name ~* '(dress|skirt|blouse)';
