import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { AuthButton } from "@/components/auth-button";

export const metadata = { title: "Khazanay" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      auth={
        <Suspense>
          <AuthButton />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
