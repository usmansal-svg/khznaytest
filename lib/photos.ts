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
