/** Client-side photo helpers shared by the tag form and the garment page. */

/** Keep uploads quick on mobile data: longest side capped, JPEG 0.9. */
export async function downscale(file: Blob, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.type === "image/jpeg") return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.9));
}

export async function uploadPhoto(sku: string, file: Blob, kind: "original" | "cutout" = "original"): Promise<void> {
  const fd = new FormData();
  fd.append("sku", sku);
  fd.append("kind", kind);
  fd.append("file", file, kind === "cutout" ? "cutout.jpg" : "photo.jpg");
  const res = await fetch("/api/photos", { method: "POST", body: fd });
  if (!res.ok) throw new Error((await res.json()).error ?? "Photo upload failed.");
}

/**
 * Shopify-ready and cheap to store: longest side 2000 px, JPEG, and under
 * `maxBytes` (1 MB) — quality steps down until it fits, then the size does.
 */
export async function compressUnder(file: Blob, maxBytes = 1024 * 1024, max = 2000): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  let side = Math.min(max, Math.max(bmp.width, bmp.height));
  for (;;) {
    const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.88, 0.82, 0.75, 0.68, 0.6]) {
      const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", q));
      if (blob.size <= maxBytes) return blob;
    }
    if (side <= 800) {
      return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.5));
    }
    side = Math.round(side * 0.8);
  }
}

/** A transparent PNG cut-out onto white, as JPEG. */
export async function onWhite(png: Blob, quality = 0.9): Promise<Blob> {
  const bmp = await createImageBitmap(png);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", quality));
}

/**
 * Shopify's sweet spot: a 2048 × 2048 square. Centre-crops the longer side,
 * scales to `side`, and returns JPEG under `maxBytes`.
 */
export async function squareForShopify(file: Blob, side = 2048, maxBytes = 1024 * 1024): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const sx = Math.round((bmp.width - s) / 2);
  const sy = Math.round((bmp.height - s) / 2);
  const out = Math.min(side, s); // never upscale — that is what pixelates
  const c = document.createElement("canvas");
  c.width = out;
  c.height = out;
  c.getContext("2d")!.drawImage(bmp, sx, sy, s, s, 0, 0, out, out);
  for (const q of [0.9, 0.85, 0.8, 0.75, 0.7, 0.62]) {
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", q));
    if (blob.size <= maxBytes) return blob;
  }
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.55));
}

/**
 * A transparent cut-out onto a white square with a soft, feathered drop
 * shadow, so the garment reads as sitting on the page rather than pasted on.
 */
export async function cutoutOnWhite(png: Blob, side = 2048, quality = 0.88): Promise<Blob> {
  const bmp = await createImageBitmap(png);
  const c = document.createElement("canvas");
  c.width = side;
  c.height = side;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, side, side);
  // Fit the garment inside a 6% margin, centred.
  const margin = side * 0.06;
  const scale = Math.min((side - 2 * margin) / bmp.width, (side - 2 * margin) / bmp.height);
  const w = bmp.width * scale;
  const h = bmp.height * scale;
  const x = (side - w) / 2;
  const y = (side - h) / 2;
  // The shadow follows the garment's alpha: soft, slightly below, low opacity.
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = side * 0.035;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = side * 0.012;
  ctx.drawImage(bmp, x, y, w, h);
  ctx.restore();
  ctx.drawImage(bmp, x, y, w, h);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", quality));
}

export type Adjust = { brightness: number; contrast: number; rotate: 0 | 90 | 180 | 270 };
export const NO_ADJUST: Adjust = { brightness: 1, contrast: 1, rotate: 0 };

/**
 * Brightness, contrast and rotation baked into the pixels (no reliance on
 * canvas filters, which older Safari lacks). brightness/contrast are
 * multipliers around 1; contrast pivots on mid-grey.
 */
export async function applyAdjust(file: Blob, a: Adjust): Promise<Blob> {
  if (a.brightness === 1 && a.contrast === 1 && a.rotate === 0) return file;
  const bmp = await createImageBitmap(file);
  const rot = a.rotate === 90 || a.rotate === 270;
  const c = document.createElement("canvas");
  c.width = rot ? bmp.height : bmp.width;
  c.height = rot ? bmp.width : bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((a.rotate * Math.PI) / 180);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  if (a.brightness !== 1 || a.contrast !== 1) {
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const b = a.brightness;
    const k = a.contrast;
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.max(0, Math.min(255, Math.round(((i * b) - 128) * k + 128)));
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(img, 0, 0);
  }
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.95));
}

/**
 * Auto-enhance for product shots on a white background: neutral white
 * balance from the background, then a gentle levels stretch so the whites
 * are white and the darks hold detail. Deterministic, no model, ~100 ms.
 * Deliberately mild — it must never invent or hide anything on the garment.
 */
export async function autoEnhance(file: Blob, quality = 0.92): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  // Sample every 8th pixel for the statistics.
  const hist = new Uint32Array(256);
  let n = 0, br = 0, bg = 0, bb = 0, bn = 0;
  for (let i = 0; i < d.length; i += 32) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    hist[y]++; n++;
    if (y > 215) { br += r; bg += g; bb += b; bn++; } // the backdrop
  }
  // White balance: scale channels so the backdrop is neutral (capped so a coloured garment cannot fool it).
  let sr = 1, sg = 1, sb = 1;
  if (bn > n * 0.05) {
    const m = (br + bg + bb) / (3 * bn);
    const clamp = (v: number) => Math.min(1.12, Math.max(0.9, v));
    sr = clamp(m / (br / bn)); sg = clamp(m / (bg / bn)); sb = clamp(m / (bb / bn));
  }
  // Levels: 0.3 % black point, 99.7 % white point, mild.
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.003) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.003) { hi = v; break; } }
  lo = Math.min(lo, 40); hi = Math.max(hi, 200);
  const gain = 255 / Math.max(1, hi - lo);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, (v - lo) * gain));
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[Math.min(255, Math.round(d[i] * sr))];
    d[i + 1] = lut[Math.min(255, Math.round(d[i + 1] * sg))];
    d[i + 2] = lut[Math.min(255, Math.round(d[i + 2] * sb))];
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", quality));
}
