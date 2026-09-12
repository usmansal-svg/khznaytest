import Link from "next/link";

import { HealthChecks } from "@/components/health-checks";
import { OutletsCard } from "@/components/admin/outlets-card";
import { RareReasonsEditor } from "@/components/admin/rare-reasons-editor";
import { StaffAdmin } from "@/components/admin/staff-admin";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings · Khazanay" };
export const instant = false;

const TABS = [
  { key: "staff", label: "Staff" },
  { key: "outlets", label: "Outlets" },
  { key: "shopify", label: "Shopify" },
  { key: "rare", label: "Rare finds" },
  { key: "system", label: "System" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** General settings, one tab per thing that can change: people, outlets, Shopify, and the connection checks. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === raw)?.key ?? "staff") as Tab;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Staff and PINs, outlets, the Shopify connection, rare-find reasons, and the system checks. Pricing and brands have their own menus.</p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/settings?tab=${t.key}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</Link>
        ))}
      </nav>
      {tab === "staff" && <StaffAdmin />}
      {tab === "outlets" && <OutletsCard mode="outlets" />}
      {tab === "shopify" && <OutletsCard mode="shopify" />}
      {tab === "rare" && <RareReasonsEditor />}
      {tab === "system" && <div className="font-mono text-sm"><HealthChecks /></div>}
    </div>
  );
}
