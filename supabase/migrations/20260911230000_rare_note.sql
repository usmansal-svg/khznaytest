-- Rare finds are decided at grading, before tagging. The tagger marks the
-- garment rare and writes why; the note prints on the tag and goes to
-- Shopify. The set-aside hand-off flow is retired.
alter table public.items add column if not exists rare_note text;
