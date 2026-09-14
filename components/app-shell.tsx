"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRightLeft, Award, Camera, ClipboardCheck, PanelLeftClose, PanelLeftOpen, LayoutDashboard, Network, Package, Search, Settings, SlidersHorizontal, Tag, Tags, type LucideIcon } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { PERMISSIONS, homeFor, permissionsFor, type Permission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; key: Permission };
const ICONS: Record<Permission, LucideIcon> = { dashboard: LayoutDashboard, tag: Tag, items: Search, photos: Camera, transfers: ArrowRightLeft, qc: ClipboardCheck, lots: Package, catalogue: Network, pricing: SlidersHorizontal, brands: Tags, scorecard: Award, settings: Settings };
const NAV: NavItem[] = PERMISSIONS.map((p) => ({ href: p.paths[0], label: p.label, icon: ICONS[p.key], key: p.key }));

/** `auth` is rendered by the server layout — AuthButton is a Server Component and must not be imported here. */
export function AppShell({ auth, children }: { auth: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const [perms, setPerms] = useState<Permission[] | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        const next = j.staff?.role ?? null;
        setPerms(next ? (Array.isArray(j.staff?.perms) ? j.staff.perms : permissionsFor(next, null)) : null);
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
  const mine = perms ?? [];
  const home = homeFor(mine);
  const allowed = NAV.filter((i) => mine.includes(i.key));
  const work = allowed.filter((i) => PERMISSIONS.find((p) => p.key === i.key)?.group === "Work");
  const admin = allowed.filter((i) => PERMISSIONS.find((p) => p.key === i.key)?.group === "Admin");

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
