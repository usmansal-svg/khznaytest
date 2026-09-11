/**
 * POST /api/photos  multipart: sku, kind (original | cutout), file
 * DELETE /api/photos { sku, path }
 *
 * Stores garment photos in the public `garments` bucket and records them on
 * the item, newest last. Cut-outs are what Shopify receives when they exist.
 */

import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/staff";

type Photo = { path: string; url: string; kind: "original" | "cutout"; bytes: number; taken_at: string; by?: number };

export async function POST(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  const supabase = gate.db;

  const form = await request.formData();
  const sku = String(form.get("sku") ?? "").trim().toUpperCase();
  const kind = form.get("kind") === "cutout" ? "cutout" : "original";
  const file = form.get("file");
  if (!sku || !(file instanceof File)) return NextResponse.json({ error: "sku and file are required." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Photo is over 15 MB." }, { status: 413 });

  const { data: item } = await supabase.from("items").select("id, photos, photographed_by").eq("sku", sku).maybeSingle();
  if (!item) return NextResponse.json({ error: `No item with SKU ${sku}.` }, { status: 404 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${sku}/${Date.now()}-${kind}.${ext}`;
  const { error: upErr } = await supabase.storage.from("garments").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = supabase.storage.from("garments").getPublicUrl(path);
  const photo: Photo = { path, url: pub.publicUrl, kind, bytes: file.size, taken_at: new Date().toISOString(), by: gate.staff.id };
  const photos = [...((item.photos ?? []) as Photo[]), photo];

  // First original picture stamps the photographer and the time — the daily target counts garments, not shots.
  const stamp = kind === "original" && !item.photographed_by ? { photographed_by: gate.staff.id, photographed_at: photo.taken_at } : {};
  const { error } = await supabase.from("items").update({ photos, ...stamp, ...(kind === "cutout" ? { online_status: "ready" } : {}) }).eq("id", item.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photo, photos });
}

export async function DELETE(request: Request) {
  let body: { sku?: string; path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  const supabase = gate.db;

  const sku = body.sku?.trim().toUpperCase();
  if (!sku || !body.path?.startsWith(`${sku}/`)) return NextResponse.json({ error: "sku and a matching path are required." }, { status: 400 });

  const { data: item } = await supabase.from("items").select("id, photos").eq("sku", sku).maybeSingle();
  if (!item) return NextResponse.json({ error: `No item with SKU ${sku}.` }, { status: 404 });

  await supabase.storage.from("garments").remove([body.path]);
  const photos = ((item.photos ?? []) as Photo[]).filter((p) => p.path !== body.path);
  const { error } = await supabase.from("items").update({ photos }).eq("id", item.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photos });
}
