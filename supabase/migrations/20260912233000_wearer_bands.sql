-- Wearer list with age bands (12 Sep): men, women, unisex adult, teen / kids /
-- toddler / infant each split boy / girl. Older values stay valid for rows
-- tagged before.
alter table public.items drop constraint if exists items_wearer_check;
alter table public.items add constraint items_wearer_check
  check (wearer is null or wearer in ('men', 'women', 'unisex', 'teen_boy', 'teen_girl', 'kids_boy', 'kids_girl', 'toddler_boy', 'toddler_girl', 'infant_boy', 'infant_girl', 'teenage', 'kid', 'toddler', 'infant', 'boy', 'girl'));
