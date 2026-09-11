/**
 * POST /api/admin/brands/logo — multipart { name, file } sets a brand's logo
 * (PNG/JPG/WebP up to 1 MB), stored in the public `garments` bucket under
 * brand-logos/. DELETE { name } clears it. Shown on the tag form's
 * quick-pick buttons so a tagger recognises the brand at a glance.
 */

import { NextResponse } from "next/server";

import { audit, requireManager } from "@/lib/admin/auth";

export const instant = false;

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }; // the bucket does not take SVG
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";

export async function POST(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the logo as a file field named 'file' with the brand 'name'." }, { status: 400 });
  }
  const name = String(form.get("name") ?? "").trim();
  const file = form.get("file");
  if (!name || !(file instanceof File)) return NextResponse.json({ error: "Brand name and a file are required." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a PNG, JPG or WebP image." }, { status: 400 });
  if (file.size > 1024 * 1024) return NextResponse.json({ error: "Keep the logo under 1 MB — a 200-pixel image is plenty." }, { status: 400 });

  const db = gate.db;
  const { data: brand } = await db.from("brands").select("id, name, logo_url").eq("name", name).maybeSingle();
  if (!brand) return NextResponse.json({ error: `No brand called "${name}".` }, { status: 404 });

  const path = `brand-logos/${slug(name)}-${Date.now()}.${ext}`;
  const { error: upErr } = await db.storage.from("garments").upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const { data: pub } = db.storage.from("garments").getPublicUrl(path);
  const { error } = await db.from("brands").update({ logo_url: pub.publicUrl }).eq("id", brand.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(db, gate.staff.id, "brands", name, { logo_url: brand.logo_url }, { logo_url: pub.publicUrl }, "Logo");
  return NextResponse.json({ name, logo_url: pub.publicUrl });
}

export async function DELETE(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const db = gate.db;
  const { data: brand } = await db.from("brands").select("id, logo_url").eq("name", name).maybeSingle();
  if (!brand) return NextResponse.json({ error: `No brand called "${name}".` }, { status: 404 });
  const { error } = await db.from("brands").update({ logo_url: null }).eq("id", brand.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(db, gate.staff.id, "brands", name, { logo_url: brand.logo_url }, { logo_url: null }, "Logo removed");
  return NextResponse.json({ name, logo_url: null });
}
