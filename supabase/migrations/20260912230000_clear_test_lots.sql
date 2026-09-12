-- Clear the testing lots (12 Sep 2026, on Usman's instruction) so lot
-- recording starts fresh in Commercials. Garments keep their rows; they
-- simply no longer point at a lot. Lot numbering restarts at LOT-0001.

update public.items set lot_id = null where lot_id is not null;
update public.commercial_recommendations set lot_id = null where lot_id is not null;
delete from public.lot_costs;
delete from public.lots;
update public.lot_counter set seq = 0 where id = 1;
