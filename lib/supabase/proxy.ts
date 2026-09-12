import { createServerClient } from "@supabase/ssr";

import { SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth/session";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Staff PIN session (shared iPads). Verified with Web Crypto so this runs
  // at the edge; the cookie carries no secret, only a signature.
  const secret = sessionSecret();
  const staff = secret ? await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret) : null;

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/auth") ||
    // /health is a public connectivity check and must not require a session.
    path.startsWith("/health") ||
    // TEMPORARY: the pricing demo is open for a look without an account.
    // Re-gate before production use.
    path.startsWith("/price") ||
    path.startsWith("/api/price") ||
    // Tags print from a plain image URL; the SKU is the only payload.
    path.startsWith("/api/tags") ||
    // Shopify calls this with a signed body; the route verifies the signature itself.
    path === "/api/shopify/webhook";

  if (!user && !staff && !isPublic) {
    // API callers get a 401 they can act on. Redirecting a fetch() to the
    // login page hands the caller an HTML document with a 200, which is
    // indistinguishable from success until it fails to parse.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      const denied = NextResponse.json({ error: "Not signed in." }, { status: 401 });
      for (const cookie of supabaseResponse.cookies.getAll()) denied.cookies.set(cookie);
      return denied;
    }

    // Send people to the PIN screen, and back to where they were after.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  // Role gate: taggers see the tag screen and item lookup only. Anything
  // with costs, staff or the master view needs a manager or the founder;
  // floor and transfers need QC senior or above.
  if (staff) {
    // The photographer sees the Photos station and nothing else.
    if (staff.role === "photographer") {
      const allowed = ["/photos", "/api/photos", "/api/items/", "/api/auth", "/login", "/health", "/api/tags"];
      if (!allowed.some((p) => path.startsWith(p))) {
        if (path.startsWith("/api/")) {
          const denied = NextResponse.json({ error: "Your role cannot open this." }, { status: 403 });
          for (const cookie of supabaseResponse.cookies.getAll()) denied.cookies.set(cookie);
          return denied;
        }
        const url = request.nextUrl.clone();
        url.pathname = "/photos";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
    const managerOnly = ["/dashboard", "/lots", "/admin", "/api/dashboard", "/api/lots", "/api/admin", "/api/export"];
    const seniorUp = ["/floor", "/transfers", "/qc", "/api/floor", "/api/transfers", "/api/qc"];
    const rank = { tagger: 0, qc_senior: 1, manager: 2, founder: 3, photographer: 0, cashier: 0, outlet_manager: 1 }[staff.role] ?? 0;
    const need = managerOnly.some((p) => path.startsWith(p)) ? 2 : seniorUp.some((p) => path.startsWith(p)) ? 1 : 0;
    if (rank < need) {
      if (path.startsWith("/api/")) {
        const denied = NextResponse.json({ error: "Your role cannot open this." }, { status: 403 });
        for (const cookie of supabaseResponse.cookies.getAll()) denied.cookies.set(cookie);
        return denied;
      }
      const url = request.nextUrl.clone();
      url.pathname = "/tag";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
