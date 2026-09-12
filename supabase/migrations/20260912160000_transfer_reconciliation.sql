-- Transfers become a proper dispatch / receive process (12 Sep):
--   packing → dispatched (in transit) → receiving (scan-check at the outlet) → received (closed, reconciled)
-- Every line records when it was scanned in at the origin and scanned in at
-- the destination; lines never scanned at the destination are flagged missing
-- and the garment's status becomes 'missing'. Receiving no longer floors the
-- garment: flooring is its own scan on the Floor screen, which stamps the
-- floor date, the colour and who floored it.

alter table public.transfers drop constraint if exists transfers_status_check;
update public.transfers set status = 'packing'    where status = 'open';
update public.transfers set status = 'dispatched' where status = 'sent';
alter table public.transfers alter column status set default 'packing';
alter table public.transfers add constraint transfers_status_check
  check (status in ('packing', 'dispatched', 'receiving', 'received'));

alter table public.transfers
  add column if not exists dispatched_by        bigint references public.staff (id),
  add column if not exists boxes                int,
  add column if not exists carrier              text,
  add column if not exists receiving_started_at timestamptz,
  add column if not exists receiving_started_by bigint references public.staff (id),
  add column if not exists received_count       int,
  add column if not exists missing_count        int,
  add column if not exists unexpected_count     int;

alter table public.transfer_items
  add column if not exists added_at    timestamptz not null default now(),
  add column if not exists added_by    bigint references public.staff (id),
  add column if not exists received_at timestamptz,
  add column if not exists received_by bigint references public.staff (id),
  add column if not exists missing     boolean not null default false,
  add column if not exists unexpected  boolean not null default false,
  add column if not exists found_at    timestamptz;

-- Lines on transfers received under the old rule (receipt = floored) count as received.
update public.transfer_items ti set received_at = t.received_at, received_by = t.received_by
  from public.transfers t where t.id = ti.transfer_id and t.status = 'received' and ti.received_at is null;

alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check
  check (status in ('tagged', 'on_floor', 'sold', 'pulled', 'set_aside', 'rejected', 'returned_damaged', 'missing'));
alter table public.items add column if not exists floored_by bigint references public.staff (id);
