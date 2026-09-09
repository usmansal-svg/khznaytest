import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { StaffBadge } from "@/components/staff-badge";

export const metadata = { title: "Khazanay" };

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
