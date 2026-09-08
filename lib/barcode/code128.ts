/**
 * Code 128 (subset B) encoder rendered as SVG — spec section 6 and 10.
 *
 * The SKU is the payload. Subset B covers every printable ASCII character,
 * which is all a SKU like KHZ-SM-MBD-00042 needs; the digit-run compression
 * of subset C is skipped on purpose to keep this small and obviously correct.
 *
 * Each symbol is 11 modules wide, written as six alternating bar/space
 * widths. The stop symbol is 13 modules. Table order is the standard
 * value order (0–106), so the checksum arithmetic indexes it directly.
 */

const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const;

const START_B = 104;
const STOP = 106;

/** Exposed for the integrity test: every pattern must total 11 modules (stop: 13). */
export const PATTERN_TABLE = PATTERNS;

/** Subset B value of a character: ASCII 32–127 map to 0–95. */
function valueB(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 127) throw new Error(`Code 128 B cannot encode ${JSON.stringify(ch)}`);
  return code - 32;
}

/** The symbol values, including start, checksum and stop. */
export function encode(text: string): number[] {
  if (!text) throw new Error("Nothing to encode");
  const values = [...text].map(valueB);
  let checksum = START_B;
  values.forEach((v, i) => {
    checksum += v * (i + 1);
  });
  return [START_B, ...values, checksum % 103, STOP];
}

/**
 * The bar/space run lengths for the whole symbol, starting with a bar.
 * Consumers only need the widths; module count is their sum.
 */
export function modules(text: string): number[] {
  return encode(text).flatMap((v) => [...PATTERNS[v]].map(Number));
}

export type SvgOptions = {
  /** Width of one module in user units. Default 1. */
  moduleWidth?: number;
  /** Bar height in user units. Default 40. */
  height?: number;
  /** Quiet zone on each side, in modules. Spec minimum is 10. */
  quietZone?: number;
  /** Print the text under the bars. Default true. */
  showText?: boolean;
  /** Font size for the text. Default 8. */
  fontSize?: number;
};

/**
 * A self-contained SVG. Bars are one path so the file stays tiny and prints
 * crisply at any scale; the caller sizes it with CSS.
 */
export function toSvg(text: string, options: SvgOptions = {}): string {
  const mw = options.moduleWidth ?? 1;
  const height = options.height ?? 40;
  const quiet = options.quietZone ?? 10;
  const showText = options.showText ?? true;
  const fontSize = options.fontSize ?? 8;

  const runs = modules(text);
  const totalModules = runs.reduce((a, b) => a + b, 0) + quiet * 2;
  const width = totalModules * mw;
  const textHeight = showText ? fontSize + 4 : 0;

  let x = quiet * mw;
  const rects: string[] = [];
  runs.forEach((run, i) => {
    const w = run * mw;
    if (i % 2 === 0) rects.push(`M${x} 0h${w}v${height}h-${w}z`);
    x += w;
  });

  const label = showText
    ? `<text x="${width / 2}" y="${height + fontSize + 1}" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="${fontSize}">${escapeXml(text)}</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + textHeight}" width="${width}" height="${height + textHeight}" shape-rendering="crispEdges">` +
    `<rect width="${width}" height="${height + textHeight}" fill="#fff"/>` +
    `<path d="${rects.join("")}" fill="#000"/>` +
    label +
    `</svg>`
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}
