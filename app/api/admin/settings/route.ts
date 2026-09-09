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
  const [ctx, versions, audits] = await Promise.all([
    loadPricingContext(supabase),
    supabase.from("settings").select("version, note, created_at, staff:changed_by(name)").order("version", { ascending: false }).limit(50),
    supabase.from("admin_audits").select("id, table_name, row_key, before, after, changed_at, note, staff:changed_by(name)").in("table_name", ["settings", "profiles", "grades", "sub_categories", "brands", "staff", "lots"]).order("changed_at", { ascending: false }).limit(200),
  ]);
  const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null | undefined;
  return NextResponse.json({
    settings: ctx.settings,
    version: ctx.settingsVersion,
    source: ctx.source,
    history: (versions.data ?? []).map((v) => ({ version: v.version, note: v.note, created_at: v.created_at, by: one<{ name: string }>(v.staff)?.name ?? null })),
    audits: (audits.data ?? []).map((a) => ({ id: a.id, table: a.table_name, key: a.row_key, at: a.changed_at, by: one<{ name: string }>(a.staff)?.name ?? "—", note: a.note, changes: diff(a.before, a.after) })),
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
    note: body.note?.trim() || null,
    changed_by: gate.staff.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit(supabase, gate.staff.id, "settings", String(version), ctx.settings, proposed.settings, body.note);
  return NextResponse.json({ version, ...repricePreview(ctx, proposed.settings) });
}

const RANGES: Record<keyof Omit<Settings, "brandFeedbackEnabled" | "ladderDepths">, [number, number]> = {
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
  defaultDailyTarget: [1, 1000],
  qcSampleRate: [0, 1],
};

/** Human-readable field changes between two audit snapshots. */
function diff(before: unknown, after: unknown): { field: string; from: string; to: string }[] {
  if (!after || typeof after !== "object" || Array.isArray(after)) return [];
  const b = (before && typeof before === "object" && !Array.isArray(before) ? before : {}) as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const fmt = (v: unknown) => (v == null ? "—" : Array.isArray(v) ? v.join("/") : typeof v === "object" ? JSON.stringify(v) : String(v));
  return Object.keys(a)
    .filter((k) => !["pin_hash", "pin_set_at"].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => ({ field: k, from: fmt(b[k]), to: fmt(a[k]) }));
}

function validate(input: Partial<Settings> | undefined): { settings: Settings } | { error: string } {
  if (!input) return { error: "settings is required." };
  const out: Settings = { ...DEFAULT_SETTINGS };
  const d = input.ladderDepths;
  if (!Array.isArray(d) || d.length !== 3 || d.some((x) => typeof x !== "number" || !(x > 0 && x < 1))) return { error: "Markdown depths must be three percentages between 0 and 100." };
  if (!(d[0] < d[1] && d[1] < d[2])) return { error: "Markdown depths must increase: markdown 1 < markdown 2 < final." };
  out.ladderDepths = [d[0], d[1], d[2]];
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
