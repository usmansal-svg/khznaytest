"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Boxes, LogOut, PackageCheck, Receipt, ScanLine, Wallet } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { PosProvider, usePos } from "@/components/pos/pos-context";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/pos", label: "Till", icon: ScanLine },
  { href: "/pos/receive", label: "Receive", icon: PackageCheck },
  { href: "/pos/stock", label: "Stock", icon: Boxes },
  { href: "/pos/sales", label: "Sales", icon: Receipt },
  { href: "/pos/session", label: "Till session", icon: Wallet },
  { href: "/pos/reports", label: "Reports", icon: BarChart3, hq: true },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { me, error, setOutlet } = usePos();
  const pathname = usePathname();
  const router = useRouter();
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-30 border-b bg-background print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <BrandLogo href={me?.is_hq ? "/dashboard" : "/pos"} />
          <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">POS</span>
          {me && (
            <div className="ml-2 flex items-center gap-2 text-sm">
              {me.is_hq && me.outlets.length > 0 ? (
                <select value={me.outlet.id} onChange={(e) => setOutlet(Number(e.target.value))} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm font-semibold">
                  {me.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              ) : (
                <span className="font-semibold">{me.outlet.name}</span>
              )}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", me.session ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300")}>{me.session ? "Till open" : "Till closed"}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm">
            {me && <span className="hidden text-muted-foreground sm:inline">{me.staff.name}</span>}
            <button type="button" onClick={logout} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Sign out"><LogOut className="size-5" /></button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-1">
          {TABS.filter((t) => !t.hq || me?.is_hq).map((t) => {
            const active = t.href === "/pos" ? pathname === "/pos" : pathname.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} className={cn("flex items-center gap-1.5 rounded-md px-3 py-2 text-sm", active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>
                <t.icon className="size-4" /> {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 p-4">
        {error && <p className="mb-4 rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
        {children}
      </main>
    </div>
  );
}

export function PosShell({ children }: { children: React.ReactNode }) {
  return <PosProvider><Shell>{children}</Shell></PosProvider>;
}
