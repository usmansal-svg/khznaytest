import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { StaffBadge } from "@/components/staff-badge";

export const metadata = { title: "Khazanay" };

// Kept synchronous: reading the session cookie here would make every page
// runtime-rendered. The badge reads it inside Suspense; the sidebar asks
// /api/auth/me for the role on the client.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      auth={
        <Suspense>
          <StaffBadge />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
