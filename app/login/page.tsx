import { Suspense } from "react";

import { PinLogin } from "@/components/pin-login";

export const metadata = { title: "Sign in · Khazanay" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      {/* useSearchParams() inside PinLogin needs a Suspense boundary to prerender. */}
      <Suspense fallback={<div className="w-full max-w-sm rounded-xl border bg-background p-6 text-sm text-muted-foreground">Loading…</div>}>
        <PinLogin />
      </Suspense>
    </main>
  );
}
