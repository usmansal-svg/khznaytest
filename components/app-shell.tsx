"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, ArrowRightLeft, ClipboardCheck, LayoutDashboard, Package, Search, SlidersHorizontal, Tag, Tags, Users, type LucideIcon } from "lucide-react";

import { ThemeSwitcher } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";

type Role = "tagger" | "qc_senior" | "manager" | "founder";
type NavItem = { href: string; label: string; icon: LucideIcon; hint?: string; min?: Role };
const RANK: Record<Role, number> = { tagger: 0, qc_senior: 1, manager: 2, founder: 3 };

const WORK: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Master view", min: "manager" },
  { href: "/tag", label: "Tag item", icon: Tag, hint: "Grade, price, print" },
  { href: "/items", label: "Items", icon: Search, hint: "Search & reprint" },
  { href: "/transfers", label: "Transfers", icon: ArrowRightLeft, hint: "Ship to outlets", min: "qc_senior" },
  { href: "/qc", label: "QC", icon: ClipboardCheck, hint: "Regrade blind", min: "qc_senior" },
  { href: "/lots", label: "Lots", icon: Package, hint: "Bales & P&L", min: "manager" },
];

const ADMIN: NavItem[] = [
  { href: "/admin/pricing", label: "Pricing", icon: SlidersHorizontal, hint: "Constants & weights", min: "manager" },
  { href: "/admin/brands", label: "Brands", icon: Tags, hint: "Tiers & import", min: "manager" },
  { href: "/admin/compare", label: "Compare prices", icon: Tags, hint: "New in store", min: "manager" },
  { href: "/admin/staff", label: "Staff", icon: Users, hint: "Names & PINs", min: "manager" },
  { href: "/health", label: "Health", icon: Activity, min: "manager" },
];

/** `auth` is rendered by the server layout — AuthButton is a Server Component and must not be imported here. */
export function AppShell({ auth, children }: { auth: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j.staff?.role ?? null)).catch(() => {});
  }, [pathname]);
  const rank = role ? RANK[role] : 0;
  const can = (item: NavItem) => !item.min || rank >= RANK[item.min];
  const work = WORK.filter(can);
  const admin = ADMIN.filter(can);

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-background print:hidden md:flex">
        <Link href="/tag" className="flex h-14 items-center border-b px-5 text-base font-bold">
          Khazanay
        </Link>
        <nav className="flex-1 space-y-6 p-3">
          <NavGroup title="Work" items={work} pathname={pathname} />
          {admin.length > 0 && <NavGroup title="Admin" items={admin} pathname={pathname} />}
        </nav>
        <div className="flex items-center justify-between border-t p-3">
          <ThemeSwitcher />
          {auth}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-background px-4 print:hidden md:hidden">
          <Link href="/tag" className="font-bold">Khazanay</Link>
          <nav className="flex gap-3 overflow-x-auto text-sm">
            {[...work, ...admin].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn("whitespace-nowrap", pathname.startsWith(item.href) ? "font-semibold" : "text-muted-foreground")}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function NavGroup({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <div>
      <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted",
                  active ? "bg-muted font-semibold" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="hidden text-[10px] text-muted-foreground xl:inline">{item.hint}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
