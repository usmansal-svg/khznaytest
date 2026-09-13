/**
 * The measurements picture: the cut-out on white with ThredUp-style lines
 * showing where the tagger's tape went and what it read. The numbers come
 * from the tag form (inches, measured flat); only the *placement* is found
 * from the picture, by reading the garment's silhouette off the white.
 *
 * Coordinates are fractions of the square image (0–1), so lines survive any
 * resize and can be nudged by hand and stored on the photo record.
 */
import type { MeasureType } from "@/lib/pricing/sub-categories";

export type Line = { key: string; label: string; value: string; x1: number; y1: number; x2: number; y2: number };
export type Silhouette = { n: number; left: Float32Array; right: Float32Array; top: Float32Array; bottom: Float32Array; box: { x0: number; x1: number; y0: number; y1: number } | null };

/** Which lines a garment gets. Bust replaces Chest for women; Sleeve length only when measured. */
export function overlayKind(measureType: MeasureType | null | undefined): "top" | "bottom" | "dress" | null {
  if (!measureType) return null;
  if (measureType === "bottom" || measureType === "kids_bottom") return "bottom";
  if (measureType === "dress") return "dress";
  return "top";
}

const fmt = (v: unknown): string | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${Number(n.toFixed(2))}"`;
};

/** Reads the garment's extent per row and per column from a square picture on white (n × n samples). */
export async function silhouette(image: Blob | ImageBitmap, n = 400): Promise<Silhouette> {
  const bmp = image instanceof ImageBitmap ? image : await createImageBitmap(image);
  const c = document.createElement("canvas");
  c.width = n; c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, n, n);
  ctx.drawImage(bmp, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  // Garment = clearly not white. The drop shadow is a pale grey and stays out.
  const solid = (i: number) => d[i * 4 + 3] > 40 && (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3 < 205;
  const left = new Float32Array(n).fill(-1), right = new Float32Array(n).fill(-1), top = new Float32Array(n).fill(-1), bottom = new Float32Array(n).fill(-1);
  let x0 = n, x1 = -1, y0 = n, y1 = -1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!solid(y * n + x)) continue;
    if (left[y] < 0) left[y] = x; right[y] = x;
    if (top[x] < 0) top[x] = y; bottom[x] = y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { n, left, right, top, bottom, box: x1 < 0 ? null : { x0: x0 / n, x1: x1 / n, y0: y0 / n, y1: y1 / n } };
}

/** Where the lines go for this garment, given what was measured. Empty when nothing usable was measured or no garment was found. */
export function suggestLines(sil: Silhouette, kind: "top" | "bottom" | "dress", measurements: Record<string, unknown>, gender: string | null | undefined): Line[] {
  const box = sil.box;
  if (!box) return [];
  const n = sil.n;
  const W = box.x1 - box.x0, H = box.y1 - box.y0;
  if (W < 0.1 || H < 0.1) return [];
  const row = (y: number) => { const i = Math.min(n - 1, Math.max(0, Math.round(y * n))); return sil.left[i] < 0 ? null : { l: sil.left[i] / n, r: sil.right[i] / n }; };
  const col = (x: number) => { const i = Math.min(n - 1, Math.max(0, Math.round(x * n))); return sil.top[i] < 0 ? null : { t: sil.top[i] / n, b: sil.bottom[i] / n }; };
  const widthAt = (y: number) => { const r = row(y); return r ? r.r - r.l : 0; };
  const narrowest = (from: number, to: number) => { let best = from, bw = Infinity; for (let y = from; y <= to; y += 1 / n) { const w = widthAt(y); if (w > 0 && w < bw) { bw = w; best = y; } } return best; };
  const get = (...keys: string[]) => { for (const k of keys) { const v = fmt(measurements[k]); if (v) return v; } return null; };
  const lines: Line[] = [];
  const across = (key: string, label: string, value: string, y: number) => { const r = row(y); if (r && r.r - r.l > 0.05) lines.push({ key, label, value, x1: r.l, y1: y, x2: r.r, y2: y }); };
  const down = (key: string, label: string, value: string, x: number) => { const cl = col(x); if (cl && cl.b - cl.t > 0.1) lines.push({ key, label, value, x1: x, y1: cl.t, x2: x, y2: cl.b }); };

  if (kind === "bottom") {
    const waist = get("Waist");
    if (waist) across("waist", "Waist", waist, box.y0 + 0.035 * H);
    const length = get("Length");
    if (length) down("length", "Length", length, box.x0 + 0.1 * W);
    return lines;
  }
  // Tops, outerwear and dresses: the chest goes just under the armpits — the
  // row where the width falls away fastest below the sleeves.
  let pit = box.y0 + 0.3 * H;
  { let bestDrop = 0; const step = 0.02 * H;
    for (let y = box.y0 + 0.1 * H; y <= box.y0 + 0.5 * H; y += 1 / n) { const drop = widthAt(y - step) - widthAt(y); if (drop > bestDrop) { bestDrop = drop; pit = y; } }
    if (bestDrop < 0.03) pit = box.y0 + 0.3 * H; }
  const chest = get(gender === "women" ? "Bust" : "Chest", "Chest", "Bust");
  if (chest) across("chest", gender === "women" || kind === "dress" ? "Bust" : "Chest", chest, Math.min(box.y1 - 0.05 * H, pit + 0.025 * H));
  if (kind === "dress") {
    const waist = get("Waist");
    if (waist) across("waist", "Waist", waist, narrowest(pit + 0.1 * H, box.y0 + 0.68 * H));
  }
  const length = get("Length");
  if (length) down("length", "Length", length, box.x0 + 0.66 * W);
  const sleeve = get("Sleeve length", "Sleeve");
  if (sleeve && measurements.Sleeve !== "Sleeveless") {
    // Shoulder: the top edge a fifth of the way in. Cuff: the garment's leftmost point.
    const sx = box.x0 + 0.2 * W;
    const sh = col(sx);
    let cx = 1, cy = 0;
    for (let y = box.y0 + 0.05 * H; y <= box.y1 - 0.05 * H; y += 1 / n) { const r = row(y); if (r && r.l < cx) { cx = r.l; cy = y; } }
    if (sh && cx < sx) lines.push({ key: "sleeve", label: "Sleeve", value: sleeve, x1: sx, y1: sh.t, x2: cx, y2: cy });
  }
  return lines;
}

const INK = "#1c1917";

/**
 * Draws the lines on the square picture: dashed charcoal dimension lines with
 * tailor's-tick ends and a black label, like a pattern drawing. `side` is
 * the output size; `image` is the white cut-out.
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, side: number, lines: Line[], opts: { handles?: boolean } = {}) {
  const s = side / 2048;
  ctx.lineCap = "butt"; ctx.lineJoin = "miter";
  for (const ln of lines) {
    const x1 = ln.x1 * side, y1 = ln.y1 * side, x2 = ln.x2 * side, y2 = ln.y2 * side;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // perpendicular, for the end ticks
    const tick = 26 * s;
    // A white halo under everything keeps the marks legible on dark cloth.
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? INK : "rgba(255,255,255,0.9)";
      ctx.lineWidth = (pass ? 5 : 13) * s;
      ctx.setLineDash(pass ? [22 * s, 14 * s] : []);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = (pass ? 6 : 14) * s;
      for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.moveTo(x - nx * tick, y - ny * tick); ctx.lineTo(x + nx * tick, y + ny * tick); ctx.stroke(); }
    }
    if (opts.handles) for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x, y, 22 * s, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 4 * s; ctx.stroke(); }
    // Label: black tag with white text, off to the side of the line.
    const text = `${ln.label} ${ln.value}`;
    ctx.font = `700 ${44 * s}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    const tw = ctx.measureText(text).width, ph = 64 * s, pw = tw + 40 * s;
    const vertical = Math.abs(dx) < Math.abs(dy);
    let px: number, py: number;
    if (vertical) { px = Math.max(x1, x2) + 34 * s; py = (y1 + y2) / 2 - ph / 2; if (px + pw > side - 10 * s) px = Math.min(x1, x2) - pw - 34 * s; }
    else if (ln.key === "sleeve") { px = (x1 + x2) / 2 - pw / 2; py = Math.min(y1, y2) - ph - 34 * s; }
    else { px = (x1 + x2) / 2 - pw / 2; py = y1 - ph - 34 * s; }
    px = Math.max(8 * s, Math.min(side - pw - 8 * s, px)); py = Math.max(8 * s, Math.min(side - ph - 8 * s, py));
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8 * s); ctx.fillStyle = INK; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(text, px + 20 * s, py + ph / 2 + 2 * s);
  }
}

/** The finished picture: the white cut-out with the lines, JPEG, square. */
export async function renderOverlay(cutout: Blob, lines: Line[], side = 2048, quality = 0.88): Promise<Blob> {
  const bmp = await createImageBitmap(cutout);
  const c = document.createElement("canvas");
  c.width = side; c.height = side;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, side, side);
  ctx.drawImage(bmp, 0, 0, side, side);
  drawOverlay(ctx, side, lines);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", quality));
}
