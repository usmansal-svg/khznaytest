/**
 * Brand name hygiene, offline. Taggers type fast on an iPad; this turns
 * "calvin klien" into the Calvin Klein already on the list, and "levis"
 * typed as a new brand into "Levis" rather than "levis".
 */

/** Tokens kept exactly as typed when they are all caps or contain & or . */
function keepAsIs(token: string): boolean {
  return /[&.]/.test(token) || (token.length <= 4 && token === token.toUpperCase() && /[A-Z]/.test(token));
}

const SMALL = new Set(["and", "of", "the", "de", "di", "du", "von", "van", "by", "for"]);

/** Title Case with sensible exceptions; collapses spaces; fixes apostrophes. */
export function normaliseBrand(raw: string): string {
  const cleaned = raw.replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((tok, i) => {
      if (keepAsIs(tok)) return tok;
      const lower = tok.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      // hyphenated and apostrophe parts each get a capital: "jean-paul", "levi's"
      return lower.replace(/(^|[-'])([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(/'S$/, "'s");
    })
    .join(" ");
}

/** Letters and digits only, lower case — what the comparison sees. */
export function brandKey(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

/** Damerau–Levenshtein distance (transpositions count as one edit). */
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

export type BrandMatch<T extends { name: string }> = { brand: T; exact: boolean; corrected: boolean };

/**
 * Find the brand a tagger meant. Exact (case/punctuation-insensitive) first;
 * then the closest by edit distance if it is within a small budget that
 * scales with length. Returns null when nothing is close enough.
 */
export function matchBrand<T extends { name: string }>(input: string, brands: readonly T[]): BrandMatch<T> | null {
  const key = brandKey(input);
  if (!key) return null;
  const exact = brands.find((b) => brandKey(b.name) === key);
  if (exact) return { brand: exact, exact: true, corrected: brandKey(input) !== key || input.trim() !== exact.name };
  const budget = key.length <= 4 ? 0 : key.length <= 7 ? 1 : key.length <= 12 ? 2 : 3;
  if (!budget) return null;
  let best: { b: T; d: number } | null = null;
  for (const b of brands) {
    const k = brandKey(b.name);
    if (Math.abs(k.length - key.length) > budget) continue;
    const d = editDistance(key, k);
    if (d <= budget && (!best || d < best.d)) best = { b, d };
  }
  return best ? { brand: best.b, exact: false, corrected: true } : null;
}
