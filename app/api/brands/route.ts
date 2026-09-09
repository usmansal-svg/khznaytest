/**
 * GET /api/brands?q=… — prefix search for the tagging form's datalist.
 * Returns name and tier so the tier can show as soon as the brand resolves.
 */

import { NextResponse } from "next/server";

import { currentStaff, dbFor } from "@/lib/auth/staff";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ brands: [] });

  const supabase = await dbFor(await currentStaff());
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, tier")
    .eq("active", true)
    .ilike("name", `${q}%`)
    .order("name")
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brands: data ?? [] });
}
