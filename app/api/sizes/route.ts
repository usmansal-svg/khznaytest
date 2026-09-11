/**
 * POST   /api/sizes { series, label } — add a size button to a series (any staff)
 * DELETE /api/sizes { series, label } — remove one (managers)
 *
 * The built-in series live in lib/pricing/sizes.ts; these are the extras a
 * tagger adds with the + button when a label is missing (24 waist, XXS).
 */

import { NextResponse } from "next/server";

import { audit } from "@/lib/admin/auth";
import { requireManager, requireStaff } from "@/lib/auth/staff";

export const instant = false;

const SERIES = ["letters", "collar", "waist", "uk", "kids"];

async function parse(request: Request): Promise<{ series: string; label: string } | { error: string }> {
  let body: { series?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return { error: "Body must be JSON." };
  }
  const series = String(body.series ?? "").trim();
  const label = String(body.label ?? "").trim().replace(/\s+/g, " ").slice(0, 12);
  if (!SERIES.includes(series)) return { error: "Unknown size series." };
  if (!label) return { error: "Type the size as it appears on the label." };
  return { series, label };
}

export async function POST(request: Request) {
  const gate = await requireStaff();
  if ("response" in gate) return gate.response;
  const p = await parse(request);
  if ("error" in p) return NextResponse.json(p, { status: 400 });
  const { error } = await gate.db.from("size_labels").upsert({ series: p.series, label: p.label, added_by: gate.staff.id }, { onConflict: "series,label" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(gate.db, gate.staff.id, "size_labels", `${p.series}/${p.label}`, null, p, "Size button added from the tag form");
  return NextResponse.json(p);
}

export async function DELETE(request: Request) {
  const gate = await requireManager();
  if ("response" in gate) return gate.response;
  const p = await parse(request);
  if ("error" in p) return NextResponse.json(p, { status: 400 });
  const { error } = await gate.db.from("size_labels").delete().eq("series", p.series).eq("label", p.label);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await audit(gate.db, gate.staff.id, "size_labels", `${p.series}/${p.label}`, p, null, "Size button removed");
  return NextResponse.json(p);
}
