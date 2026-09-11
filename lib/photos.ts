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
