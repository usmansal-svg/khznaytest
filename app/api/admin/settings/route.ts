/**
 * GET  /api/admin/settings          — current version + history
 * POST /api/admin/settings          — { settings, note }            save a new version
 * POST /api/admin/settings?preview=1 — { settings }                  reprice preview only
 *
 * Settings are never edited in place: every save inserts a new version and
 * items keep the version they were priced under.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { audit, requireManager } from "@/lib/admin/auth";
import { repricePreview } from "@/lib/admin/reprice";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/pricing/constants";
import { loadPricingContext, settingsToRow } from "@/lib/pricing/repo";

export async function GET() {
  const supabase = await createClient();
  const [ctx, history] = await Promise.all([
    loadPricingContext(supabase),
    supabase.from("settings").select("version, note, created_at").order("version", { ascending: false }).limit(20),
  ]);
  return NextResponse.json({
    settings: ctx.settings,
    version: ctx.settingsVersion,
    source: ctx.source,
    history: history.data ?? [],
    ...(ctx.warning ? { warning: ctx.warning } : {}),
  });
}

export async function POST(request: Request) {
  let body: { settings?: Partial<Settings>; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const preview = new URL(request.url).searchParams.get("preview") === "1";

  // Previews are read-only and open; saves are gated before anything else.
  const gate = preview ? null : await requireManager();
  if (gate && "response" in gate) return gate.response;
  const supabase = gate && "db" in gate ? gate.db : await createClient();

  const proposed = validate(body.settings);
  if ("error" in proposed) return NextResponse.json({ error: proposed.error }, { status: 400 });

  const ctx = await loadPricingContext(supabase);
  if (preview || !gate || !("db" in gate)) {
    return NextResponse.json({ version: ctx.settingsVersion, ...repricePreview(ctx, proposed.settings) });
  }

  const version = ctx.settingsVersion + 1;
  const { error } = await supabase.from("settings").insert({
    version,
    ...settingsToRow(proposed.settings),
    ladder_depths: [0, 0.25, 0.5, 0.75],
    ladder_months: [1, 1, 1, 1],
    note: body.note?.trim() || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(supabase, gate.staff.id, "settings", String(version), ctx.settings, proposed.settings, body.note);
  return NextResponse.json({ version, ...repricePreview(ctx, proposed.settings) });
}

const RANGES: Record<keyof Omit<Settings, "brandFeedbackEnabled">, [number, number]> = {
  fx: [1, 10000],
  blendedRate: [0.01, 1000],
  dutyPerKg: [0, 100000],
  sortingPerPiece: [0, 100000],
  inputTaxRate: [0, 1],
  inputTaxRecover: [0, 1],
  salesTax: [0, 1],
  targetGP: [0, 0.95],
  rejectedShare: [0, 0.5],
  bulkRecovery: [0, 1],
  charmStep: [1, 10000],
  charmEnd: [0, 9999],
  minPrice: [0, 1000000],
  highValueThreshold: [0, 100000000],
  defaultProvisionalYield: [0.3, 1],
};

function validate(input: Partial<Settings> | undefined): { settings: Settings } | { error: string } {
  if (!input) return { error: "settings is required." };
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
    const v = input[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return { error: `${key} must be a number.` };
    const [lo, hi] = RANGES[key];
    if (v < lo || v > hi) return { error: `${key} must be between ${lo} and ${hi}.` };
    out[key] = v;
  }
  if (typeof input.brandFeedbackEnabled !== "boolean") return { error: "brandFeedbackEnabled must be true or false." };
  out.brandFeedbackEnabled = input.brandFeedbackEnabled;
  if (out.charmEnd >= out.charmStep) return { error: "charmEnd must be smaller than charmStep." };
  return { settings: out };
}
