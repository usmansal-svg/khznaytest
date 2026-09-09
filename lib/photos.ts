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
