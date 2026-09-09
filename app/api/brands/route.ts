/**
 * GET /api/brands?q=… — prefix search for the tagging form's datalist.
 * Returns name and tier so the tier can show as soon as the brand resolves.
 */

import { NextResponse } from "next/server";

import { currentStaff, dbFor } from "@/lib/auth/staff";
import { matchBrand } from "@/lib/brands/normalise";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ brands: [] });

  const supabase = await dbFor(await currentStaff());
  const [prefix, all] = await Promise.all([
    supabase.from("brands").select("id, name, tier").eq("active", true).ilike("name", `${q}%`).order("name").limit(20),
    q.length >= 4 ? supabase.from("brands").select("id, name, tier").eq("active", true).limit(5000) : Promise.resolve({ data: null, error: null }),
  ]);
  if (prefix.error) return NextResponse.json({ error: prefix.error.message }, { status: 500 });
  const brands = [...(prefix.data ?? [])];
  // "Did you mean": a near match that the prefix search would miss.
  const near = all.data ? matchBrand(q, all.data as { id: number; name: string; tier: string }[]) : null;
  if (near && !brands.some((b) => b.id === near.brand.id)) brands.unshift(near.brand);
  return NextResponse.json({ brands, suggestion: near && !near.exact ? near.brand.name : null });
}
