"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, Printer, Scissors, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * One garment: where it goes, how it is sold, its photos, and the Shopify
 * listing. Reached right after tagging and from the Items search.
 */

type Photo = { path: string; url: string; kind: "original" | "cutout"; bytes: number; taken_at: string };
type Item = {
  sku: string; brand: string; category: string; sub_category: string; grade: string; size_label: string | null; colour: string | null;
  list_price: number; status: string; outlet: string | null; outlet_id: number | null; lot: string | null; weight_kg: number | null;
  channel: "outlet" | "online"; photos: Photo[]; description: string | null; online_status: string | null;
  shopify: { product_id: string | null; handle: string | null; tags: string[] | null; synced_at: string | null; error: string | null };
  measurements: Record<string, string | number>; measure_fields: string[];
};
type Outlet = { id: number; name: string; is_online: boolean };

const GRADE: Record<string, string> = { bnwt: "BNWT", premium: "Premium", excellent: "Excellent", very_good: "Very Good", rejected: "Rejected" };
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

export function GarmentPage({ sku }: { sku: string }) {
  const [item, setItem] = useState<Item | null>(null);
  const [preview, setPreview] = useState<{ title: string; tags: string[] } | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [shopify, setShopify] = useState<{ configured: boolean; domain: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [cutting, setCutting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/items/${encodeURIComponent(sku)}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Not found.");
    setItem(j.item);
    setPreview(j.shopify_preview);
    setDescription(j.item.description ?? "");
  }, [sku]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    fetch("/api/reference").then((r) => r.json()).then((j) => setOutlets(j.outlets ?? []));
    fetch("/api/shopify/push").then((r) => r.json()).then(setShopify);
  }, [load]);

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy("patch");
    setMessage(null);
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(sku)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMessage(ok);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File | Blob, kind: "original" | "cutout") {
    const fd = new FormData();
    fd.append("sku", sku);
    fd.append("kind", kind);
    fd.append("file", file, kind === "cutout" ? "cutout.jpg" : "photo.jpg");
    const res = await fetch("/api/photos", { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Upload failed.");
    await load();
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy("upload");
    setMessage(null);
    try {
      for (const f of files) await upload(await downscale(f, 2000), "original");
      setMessage(`${files.length} photo${files.length === 1 ? "" : "s"} added.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  // On-device background removal: the model runs in the browser (WebAssembly),
  // so there is no per-image cost and photos never leave the iPad until upload.
  async function cutout(photo: Photo) {
    setCutting(photo.path);
    setMessage("Removing background — first run downloads the model (~40 MB), then it's cached…");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const src = await (await fetch(photo.url)).blob();
      const png = await removeBackground(src, { output: { format: "image/png", quality: 0.9 } });
      const onWhite = await composite(png);
      await upload(onWhite, "cutout");
      setMessage("Background removed. The cut-out is what Shopify will receive.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Background removal failed.");
    } finally {
      setCutting(null);
    }
  }

  async function removePhoto(photo: Photo) {
    if (!window.confirm("Delete this photo?")) return;
    setBusy("delete");
    try {
      const res = await fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, path: photo.path }) });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  async function push(action: "push" | "unlist") {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/shopify/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku, action }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMessage(action === "unlist" ? "Unlisted from Shopify." : j.created ? "Listed on Shopify." : "Updated on Shopify.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Shopify failed.");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="text-destructive">{error}</p>;
  if (!item) return <p className="text-muted-foreground">Loading…</p>;

  const cutouts = item.photos.filter((p) => p.kind === "cutout");
  const originals = item.photos.filter((p) => p.kind === "original");
  const online = item.channel === "online";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-sm text-muted-foreground">{item.sku}</div>
          <h1 className="text-2xl font-bold">{item.brand || "Unbranded"} · {item.sub_category}</h1>
          <p className="text-sm text-muted-foreground">
            {GRADE[item.grade] ?? item.grade} · Size {item.size_label ?? "—"} · {rs(item.list_price)} · {item.status.replace("_", " ")}
            {item.lot && <> · lot {item.lot}</>}{item.weight_kg != null && <> · {Number(item.weight_kg).toFixed(3)} kg</>}
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/items/${item.sku}/print`} target="_blank" rel="noreferrer"><Printer className="size-4" /> Print tag</a>
        </Button>
      </div>
      {message && <p className="rounded-md border bg-muted p-3 text-sm">{message}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------ where it goes */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Where it goes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label>Channel</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={!online ? "default" : "outline"} disabled={busy !== null} onClick={() => patch({ channel: "outlet" }, "Marked for an outlet.")}>Outlet shelf</Button>
                <Button size="sm" variant={online ? "default" : "outline"} disabled={busy !== null} onClick={() => patch({ channel: "online" }, "Marked for the online store.")}>Online store</Button>
              </div>
              <p className="text-xs text-muted-foreground">Outlet: quick tag, print, ship. Online: photos, background removal, Shopify.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="outlet">Destination outlet</Label>
              <select id="outlet" value={item.outlet_id ?? ""} disabled={busy !== null} onChange={(e) => patch({ outlet_id: e.target.value ? Number(e.target.value) : null }, "Destination saved.")} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">— not decided —</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------- photos */}
        <Card id="photos">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Photos
              <span className="flex gap-2">
                <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={onPick} />
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => fileRef.current?.click()}><Camera className="size-4" /> Take / add</Button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {item.photos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No photos yet. On the iPad, <em>Take / add</em> opens the camera.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {[...cutouts, ...originals].map((p) => (
                  <figure key={p.path} className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.kind} className={cn("aspect-square w-full rounded-md border object-cover", p.kind === "cutout" && "bg-white")} />
                    <figcaption className="flex items-center justify-between text-xs">
                      <span className={cn(p.kind === "cutout" ? "font-semibold" : "text-muted-foreground")}>{p.kind === "cutout" ? "Cut-out" : "Original"}</span>
                      <span className="flex gap-1">
                        {p.kind === "original" && (
                          <button type="button" title="Remove background" disabled={cutting !== null || busy !== null} onClick={() => cutout(p)} className="rounded p-1 hover:bg-muted disabled:opacity-50">
                            <Scissors className={cn("size-3.5", cutting === p.path && "animate-pulse")} />
                          </button>
                        )}
                        <button type="button" title="Delete" disabled={busy !== null} onClick={() => removePhoto(p)} className="rounded p-1 hover:bg-muted disabled:opacity-50"><Trash2 className="size-3.5" /></button>
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------ shopify */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              <span>Online listing {item.online_status && <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal capitalize">{item.online_status}</span>}</span>
              {shopify && !shopify.configured && <span className="text-xs font-normal text-amber-600 dark:text-amber-400">Shopify not connected — set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in Vercel</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label>Title</Label>
                <p className="text-sm font-medium">{preview?.title}</p>
              </div>
              <div className="grid gap-1.5">
                <Label>Tags <span className="font-normal text-muted-foreground">· collections fill themselves from these</span></Label>
                <div className="flex flex-wrap gap-1.5">{preview?.tags.map((t) => <span key={t} className="rounded-full border bg-background px-2 py-0.5 text-xs">{t}</span>)}</div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="desc">Description <span className="font-normal text-muted-foreground">· optional; size, measurements and condition are added automatically</span></Label>
                <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== (item.description ?? "") && patch({ description }, "Description saved.")} placeholder="Anything special about this piece" />
              </div>
            </div>
            <div className="space-y-2 self-start rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                {cutouts.length ? `${cutouts.length} cut-out photo${cutouts.length === 1 ? "" : "s"} will be sent.` : originals.length ? `${originals.length} original photo${originals.length === 1 ? "" : "s"} will be sent — cut the background first for a cleaner listing.` : "Add at least one photo before listing."}
              </p>
              <Button className="w-full" disabled={busy !== null || !shopify?.configured || item.photos.length === 0 || item.status === "sold" || item.status === "rejected"} onClick={() => push("push")}>
                <Upload className="size-4" /> {busy === "push" ? "Sending…" : item.shopify.product_id ? "Update on Shopify" : "Send to Shopify"}
              </Button>
              {item.shopify.product_id && (
                <>
                  <Button variant="outline" className="w-full" disabled={busy !== null || !shopify?.configured} onClick={() => push("unlist")}>{busy === "unlist" ? "Unlisting…" : "Unlist"}</Button>
                  {shopify?.domain && (
                    <a href={`https://${shopify.domain}/admin/products/${item.shopify.product_id.split("/").pop()}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-xs underline">
                      Open in Shopify admin <ExternalLink className="size-3" />
                    </a>
                  )}
                </>
              )}
              {item.shopify.synced_at && <p className="text-center text-xs text-muted-foreground">Synced {new Date(item.shopify.synced_at).toLocaleString("en-PK")}</p>}
              {item.shopify.error && <p className="text-xs text-red-700 dark:text-red-400">{item.shopify.error}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Keep uploads quick on mobile data: longest side capped, JPEG 0.9. */
async function downscale(file: File, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.type === "image/jpeg") return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.9));
}

/** Transparent cut-out onto pure white — what a product photo should look like. */
async function composite(png: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(png);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.92));
}
