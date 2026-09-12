import { HealthChecks } from "@/components/health-checks";

// This route must never be served from the prerender cache: every request
// has to actually run the checks. `instant = false` makes it blocking.
export const instant = false;

export default async function HealthPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 font-mono text-sm">
      <h1 className="mb-1 text-2xl font-bold">Connection health</h1>
      <p className="mb-8 text-muted-foreground">
        Live check of Vercel hosting and the Supabase database.
      </p>
      <HealthChecks />
    </main>
  );
}
