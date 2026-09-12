"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRightLeft, Award, Camera, ClipboardCheck, PanelLeftClose, PanelLeftOpen, LayoutDashboard, Package, Search, Settings, SlidersHorizontal, Store, Tag, Tags, type LucideIcon } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";

type Role = "tagger" | "qc_senior" | "manager" | "founder" | "photographer" | "cashier" | "outlet_manager";
type NavItem = { href: string; label: string; icon: LucideIcon; min?: Role };
const RANK: Record<Role, number> = { tagger: 0, qc_senior: 1, manager: 2, founder: 3, photographer: 0, cashier: 0, outlet_manager: 1 };

const WORK: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, min: "manager" },
  { href: "/tag", label: "Tag item", icon: Tag },
  { href: "/items", label: "Items", icon: Search },
  { href: "/photos", label: "Photos", icon: Camera },
  { href: "/transfers", label: "Transfers", icon: ArrowRightLeft, min: "qc_senior" },
  { href: "/floor", label: "Floor stock", icon: Store, min: "qc_senior" },
  { href: "/qc", label: "QC", icon: ClipboardCheck, min: "qc_senior" },
  { href: "/lots", label: "Lots", icon: Package, min: "manager" },
];

const ADMIN: NavItem[] = [
  { href: "/admin/pricing", label: "Pricing", icon: SlidersHorizontal, min: "manager" },
  { href: "/admin/brands", label: "Brands", icon: Tags, min: "manager" },
  { href: "/admin/scorecard", label: "Scorecard", icon: Award, min: "manager" },
  { href: "/admin/settings", label: "Settings", icon: Settings, min: "manager" },
];

/** `auth` is rendered by the server layout — AuthButton is a Server Component and must not be imported here. */
export function AppShell({ auth, children }: { auth: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        const next = j.staff?.role ?? null;
        setRole(next);
        // A lapsed session (12 hours) used to leave the page up with a
        // tagger-sized menu. Send the person to sign in again instead.
        const isPublic = ["/price", "/pos", "/health", "/login"].some((p) => pathname.startsWith(p));
        if (!next && !isPublic) window.location.href = `/login?next=${encodeURIComponent(pathname)}`;
      })
      .catch(() => {});
  }, [pathname]);
  // The sidebar can be tucked away so the tag form gets the whole iPad.
  // Remembered per device; the tagger rarely needs the menu.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("khz_nav") === "closed"); } catch { /* no storage */ }
  }, []);
  function toggleNav() {
    setCollapsed((c) => { try { localStorage.setItem("khz_nav", c ? "open" : "closed"); } catch { /* fine */ } return !c; });
  }
  const rank = role ? RANK[role] : 0;
  const home = role === "photographer" ? "/photos" : role === "manager" || role === "founder" ? "/dashboard" : "/tag";
  const can = (item: NavItem) => !item.min || rank >= RANK[item.min];
  const work = role === "photographer" ? WORK.filter((i) => i.href === "/photos") : WORK.filter(can);
  const admin = role === "photographer" ? [] : ADMIN.filter(can);

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className={cn("hidden w-56 shrink-0 flex-col border-r bg-background print:hidden", !collapsed && "md:flex")}>
        <div className="flex h-14 items-center justify-between border-b pl-5 pr-2">
          <BrandLogo href={home} />
          <button type="button" onClick={toggleNav} title="Hide the menu" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><PanelLeftClose className="size-5" /></button>
        </div>
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
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 print:hidden md:hidden">
          <BrandLogo href={home} />
          <nav className="flex gap-3 overflow-x-auto text-sm">
            {(role === "photographer" ? [] : [...work, ...admin]).map((item) => (
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
        {collapsed && (
          <button type="button" onClick={toggleNav} title="Show the menu" className="fixed left-2 top-2 z-30 hidden rounded-md border bg-background p-2 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground print:hidden md:block"><PanelLeftOpen className="size-5" /></button>
        )}
        <main className={cn("flex-1 p-4 md:p-6", collapsed && "md:pt-14")}>{children}</main>
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
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
