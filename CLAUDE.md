# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Khazanay — a Next.js 15 (App Router) + Supabase app, scaffolded from the
`next.js/supabase` starter kit. The starter's tutorial scaffolding is still
present and should be removed as real features land (see Known Scaffolding).

## Commands

```bash
npm run dev     # dev server on http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint (flat config, eslint-config-next)
```

There is no test runner configured. Verify changes with `npm run build` and
`npm run lint`.

## Stack

- **Next.js** (latest, App Router, React 19, Server Components by default)
- **TypeScript** strict mode; `@/*` maps to the repo root
- **Supabase** auth via `@supabase/ssr` (cookie-based sessions)
- **Tailwind CSS 3** + **shadcn/ui** (new-york style, neutral base, CSS variables)
- **lucide-react** icons, **next-themes** for dark mode

## Layout

```
app/              routes (App Router)
  auth/           login, sign-up, forgot/update password, confirm route handler
  protected/      auth-gated area
components/       feature components (kebab-case files)
  ui/             shadcn/ui primitives — regenerate via CLI, don't hand-edit
  tutorial/       starter-kit onboarding UI (delete when no longer needed)
lib/
  supabase/       client / server / proxy Supabase factories
  utils.ts        cn() class merger, hasEnvVars flag
proxy.ts          root request interceptor (Next.js proxy, not middleware.ts)
```

## Supabase clients — pick the right one

Three factories exist and they are not interchangeable. Never share a client
across requests (Fluid compute); always create one inside the function using it.

| Context | Import |
|---|---|
| Client Component (`"use client"`) | `@/lib/supabase/client` → `createClient()` |
| Server Component, Server Action, Route Handler | `@/lib/supabase/server` → `await createClient()` |
| Request interception only | `@/lib/supabase/proxy` → `updateSession()` |

## Auth flow

`proxy.ts` runs on every non-static request and delegates to
`updateSession()`, which refreshes the session and redirects unauthenticated
users to `/auth/login` (everything except `/`, `/login*`, `/auth/*` is gated).

Two rules in `lib/supabase/proxy.ts` are load-bearing — breaking either causes
random logouts that are painful to debug:

1. Put no code between `createServerClient(...)` and `supabase.auth.getClaims()`.
2. Return the `supabaseResponse` object as-is. If you must build a new response,
   pass `request` into `NextResponse.next({ request })` and copy over all cookies.

## Conventions

- Server Components by default; add `"use client"` only when a component needs
  state, effects, or browser APIs.
- Compose class names with `cn()` from `@/lib/utils`, never string concatenation.
- Add shadcn primitives with `npx shadcn@latest add <component>` rather than
  writing them by hand; aliases are configured in `components.json`.
- Files are kebab-case; components are PascalCase named exports (pages/layouts
  stay default exports).
- Anything user-visible must work in both light and dark themes.

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Both are public/anon values. Never commit a service-role key or put one in a
`NEXT_PUBLIC_*` variable. `hasEnvVars` in `lib/utils.ts` gates the app while
these are unset.

## Sister apps on the same database

- **Commercials** (`../khazanay-commercials`): lot profitability, aging and
  the sale / hold / pull decisions queue. It reads `items`, `lots`, `sales`
  and writes `vendors`, `lot_costs`, `commercial_recommendations`, and the
  per-item decisions `items.stage_override` / `items.pull_requested`. The
  floor sweep here honours those two columns (`lib/pricing/floor.ts`).
  All migrations stay in this repo.
- **POS**: parked in `archive/pos`, to become its own project.

## Known scaffolding (remove as the app takes shape)

- `README.md`, `app/page.tsx`, `components/hero.tsx`, `components/tutorial/*`,
  `components/deploy-button.tsx`, `components/next-logo.tsx`,
  `components/supabase-logo.tsx`, `components/env-var-warning.tsx`
- The starter title/description in `app/layout.tsx` metadata
- The `hasEnvVars` escape hatches in `lib/utils.ts` and `lib/supabase/proxy.ts`
