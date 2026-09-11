/**
 * Why a garment is a rare find. Each reason has a one-line note for the
 * outlet tag (space for about two lines at 5.5pt) and a fuller paragraph for
 * the online listing. The tagger picks one or more; free text is optional.
 */

export type RareReason = { code: string; label: string; tag: string; web: string };

export const RARE_REASONS: readonly RareReason[] = [
  {
    code: "brand",
    label: "Brand",
    tag: "A brand we rarely see — genuine and hard to find here.",
    web: "This piece is from a brand that seldom turns up in our bales. It is genuine, checked by our senior team, and priced against what the same brand fetches on resale — not against our usual shelf prices.",
  },
  {
    code: "vintage",
    label: "Vintage / year",
    tag: "Vintage — a genuine piece from an earlier era.",
    web: "A true vintage find: the labels, construction and finish date this garment to an earlier era of the brand. Pieces like this were made to last and are increasingly hard to come by in this condition.",
  },
  {
    code: "fabric",
    label: "Fabric quality",
    tag: "Exceptional fabric — a cut above the usual batch.",
    web: "Set apart by its fabric: a quality of material — its weight, hand and finish — well above what comes through in a normal batch. Our senior team picked it out at grading for exactly that reason.",
  },
  {
    code: "design",
    label: "Design / style",
    tag: "Identified for its unique style and design.",
    web: "This garment was identified as a rare find for its unique style and design. It is not part of the usual run of stock; the cut, detailing or pattern make it a piece you are unlikely to see again on our rails.",
  },
  {
    code: "handwork",
    label: "Handwork",
    tag: "Handwork — embroidery, beading or hand finishing.",
    web: "Finished by hand: embroidery, beading or hand-applied detailing that no ordinary batch garment carries. Work of this kind takes hours to make and is why the piece sits on our rare shelf.",
  },
  {
    code: "limited",
    label: "Limited edition",
    tag: "Limited edition — a small or special release.",
    web: "A limited edition: released in small numbers or as a special collaboration, and rarely seen second-hand. Once it is gone, we are unlikely to find another.",
  },
  {
    code: "origin",
    label: "Made in Italy / Japan / USA",
    tag: "Made in Italy, Japan or the USA — premium manufacture.",
    web: "Made in Italy, Japan or the USA — countries whose garment-making stands for a higher standard of cut, cloth and finish. Pieces with this provenance are picked out at grading and priced accordingly.",
  },
];

export const rareReason = (code: string) => RARE_REASONS.find((r) => r.code === code);

/** The tag line: the first reason's short note, then any free text, kept to about two lines. */
export function rareTagLine(codes: string[], note: string | null | undefined): string {
  const first = codes.map(rareReason).find(Boolean);
  const parts = [first?.tag, note?.trim()].filter(Boolean) as string[];
  return parts.join(" ").slice(0, 120);
}

/** The web paragraphs: every chosen reason in full, then the free text. */
export function rareWebParagraphs(codes: string[], note: string | null | undefined): string[] {
  const out = codes.map(rareReason).filter((r): r is RareReason => Boolean(r)).map((r) => r.web);
  if (note?.trim()) out.push(note.trim());
  return out;
}
