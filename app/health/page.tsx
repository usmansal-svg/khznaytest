import { createServerClient } from "@supabase/ssr";
import { connection } from "next/server";

// This route must never be served from the prerender cache: every request
// has to actually run the checks. `instant = false` makes it blocking.
export const instant = false;

type Check = { name: string; ok: boolean; detail: string };

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  checks.push({
    name: "Vercel runtime",
    ok: true,
    detail: `${process.env.VERCEL ? "Vercel" : "local"} · env: ${
      process.env.VERCEL_ENV ?? "development"
    } · region: ${process.env.VERCEL_REGION ?? "n/a"}`,
  });

  const hasUrl = Boolean(url && !url.startsWith("your-"));
  checks.push({
    name: "SUPABASE_URL env var",
    ok: hasUrl,
    detail: hasUrl ? String(url) : "missing or still a placeholder",
  });

  const hasKey = Boolean(key && !key.startsWith("your-"));
  checks.push({
    name: "SUPABASE key env var",
    ok: hasKey,
    detail: hasKey ? `set (${String(key).slice(0, 12)}…)` : "missing or still a placeholder",
  });

  if (!hasUrl || !hasKey) {
    checks.push({
      name: "Database query",
      ok: false,
      detail: "skipped — credentials not configured",
    });
    return checks;
  }

  // Reaching the Supabase API at all proves network + project are live.
  const supabase = createServerClient(url!, key!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });

  try {
    const { data, error } = await supabase.from("health_check").select("*");
    if (error) {
      checks.push({
        name: "Database query",
        ok: false,
        detail: `${error.code ?? "error"}: ${error.message}`,
      });
    } else {
      checks.push({
        name: "Database query",
        ok: true,
        detail: `read ${data?.length ?? 0} row(s) from public.health_check`,
      });
      if (data && data.length > 0) {
        checks.push({
          name: "Row data",
          ok: true,
          detail: JSON.stringify(data),
        });
      }
    }
  } catch (e) {
    checks.push({
      name: "Database query",
      ok: false,
      detail: `threw: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  return checks;
}

async function Checks() {
  // Opt out of prerendering: these checks must run per-request.
  await connection();
  const checks = await runChecks();
  const allOk = checks.every((c) => c.ok);

  return (
    <>
      <div
        className={`mb-8 rounded-lg border p-4 text-base font-bold ${
          allOk
            ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
            : "border-red-600 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"
        }`}
      >
        {allOk ? "ALL SYSTEMS CONNECTED" : "SOMETHING IS NOT CONNECTED"}
      </div>

      <ul className="space-y-3">
        {checks.map((c) => (
          <li key={c.name} className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <span className={c.ok ? "text-green-600" : "text-red-600"}>
                {c.ok ? "PASS" : "FAIL"}
              </span>
              <span className="font-bold">{c.name}</span>
            </div>
            <div className="mt-1 break-all text-muted-foreground">{c.detail}</div>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-muted-foreground">
        Rendered {new Date().toISOString()}
      </p>
    </>
  );
}

export default async function HealthPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 font-mono text-sm">
      <h1 className="mb-1 text-2xl font-bold">Connection health</h1>
      <p className="mb-8 text-muted-foreground">
        Live check of Vercel hosting and the Supabase database.
      </p>
      <Checks />
    </main>
  );
}
