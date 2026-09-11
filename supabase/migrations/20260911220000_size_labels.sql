-- Extra size buttons added from the tag form (a 24 waist, an XXS), shared
-- by every iPad. Series: letters | collar | waist | uk | kids.
create table if not exists public.size_labels (
  series text not null,
  label text not null,
  position integer not null default 0,
  added_by integer references public.staff(id),
  added_at timestamptz not null default now(),
  primary key (series, label)
);
