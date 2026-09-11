-- Rare-find reasons, editable under Pricing → Rare finds. One reason per
-- garment; its tag line prints on the outlet tag and its web text goes to
-- the Shopify listing.
create table if not exists public.rare_reasons (
  code text primary key,
  label text not null,
  tag_line text not null,
  web_text text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);
insert into public.rare_reasons (code, label, tag_line, web_text, sort_order) values
  ('brand', 'Brand', 'A brand we rarely see — genuine and hard to find here.', 'This piece is from a brand that seldom turns up in our bales. It is genuine, checked by our senior team, and priced against what the same brand fetches on resale — not against our usual shelf prices.', 1),
  ('vintage', 'Vintage / year', 'Vintage — a genuine piece from an earlier era.', 'A true vintage find: the labels, construction and finish date this garment to an earlier era of the brand. Pieces like this were made to last and are increasingly hard to come by in this condition.', 2),
  ('fabric', 'Fabric quality', 'Exceptional fabric — a cut above the usual batch.', 'Set apart by its fabric: a quality of material — its weight, hand and finish — well above what comes through in a normal batch. Our senior team picked it out at grading for exactly that reason.', 3),
  ('design', 'Design / style', 'Identified for its unique style and design.', 'This garment was identified as a rare find for its unique style and design. It is not part of the usual run of stock; the cut, detailing or pattern make it a piece you are unlikely to see again on our rails.', 4),
  ('handwork', 'Handwork', 'Handwork — embroidery, beading or hand finishing.', 'Finished by hand: embroidery, beading or hand-applied detailing that no ordinary batch garment carries. Work of this kind takes hours to make and is why the piece sits on our rare shelf.', 5),
  ('limited', 'Limited edition', 'Limited edition — a small or special release.', 'A limited edition: released in small numbers or as a special collaboration, and rarely seen second-hand. Once it is gone, we are unlikely to find another.', 6),
  ('origin', 'Made in Italy / Japan / USA', 'Made in Italy, Japan or the USA — premium manufacture.', 'Made in Italy, Japan or the USA — countries whose garment-making stands for a higher standard of cut, cloth and finish. Pieces with this provenance are picked out at grading and priced accordingly.', 7)
on conflict (code) do nothing;
