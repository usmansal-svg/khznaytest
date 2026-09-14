/**
 * What each person may open. A permission is a screen (plus the API routes
 * behind it). Every role has a default set; a person can be given their own
 * set on the Staff screen, which then replaces the role's default.
 *
 * Runs in the proxy (Edge) and the browser alike: plain data, no imports.
 */

export type Permission = "dashboard" | "tag" | "items" | "photos" | "transfers" | "qc" | "lots" | "catalogue" | "pricing" | "brands" | "scorecard" | "settings";
export type Role = "tagger" | "qc_senior" | "manager" | "founder" | "photographer" | "cashier" | "outlet_manager";

/** In menu order. `paths` are the page and API prefixes the permission opens. */
export const PERMISSIONS: { key: Permission; label: string; group: "Work" | "Admin"; hint: string; paths: string[] }[] = [
  { key: "dashboard", label: "Dashboard", group: "Work", hint: "Today's numbers, below-sheet prices, the audit", paths: ["/dashboard", "/api/dashboard"] },
  { key: "tag", label: "Tag item", group: "Work", hint: "Tag garments and print labels", paths: ["/tag", "/api/print-jobs"] },
  { key: "items", label: "Items", group: "Work", hint: "Find, review and export garments; upload to Shopify", paths: ["/items", "/api/items", "/api/export", "/api/shopify"] },
  { key: "photos", label: "Photos", group: "Work", hint: "The photography station", paths: ["/photos", "/api/photos"] },
  { key: "transfers", label: "Transfers", group: "Work", hint: "Pack, dispatch and receive transfers", paths: ["/transfers", "/api/transfers"] },
  { key: "qc", label: "QC", group: "Work", hint: "Grade audits", paths: ["/qc", "/api/qc"] },
  { key: "lots", label: "Lots", group: "Work", hint: "The lot list (read-only here)", paths: ["/lots", "/api/lots"] },
  { key: "catalogue", label: "Catalogue", group: "Admin", hint: "Categories, sub-categories and website tags", paths: ["/admin/catalogue", "/api/admin/catalogue"] },
  { key: "pricing", label: "Pricing", group: "Admin", hint: "Costs, constants, profiles, grades, prices", paths: ["/admin/pricing", "/api/admin/pricing", "/api/admin/sub-categories", "/api/admin/settings", "/api/admin/profiles", "/api/admin/grades", "/api/admin/reprice"] },
  { key: "brands", label: "Brands", group: "Admin", hint: "Brand tiers and logos", paths: ["/admin/brands", "/api/admin/brands"] },
  { key: "scorecard", label: "Scorecard", group: "Admin", hint: "Everyone's daily numbers and targets", paths: ["/admin/scorecard", "/api/admin/scorecard"] },
  { key: "settings", label: "Settings", group: "Admin", hint: "Staff, outlets, Shopify, rare finds, system", paths: ["/admin/settings", "/admin/staff", "/admin/outlets", "/admin/health", "/admin/taggers", "/api/admin"] },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  tagger: ["tag", "items", "photos"],
  photographer: ["photos"],
  qc_senior: ["tag", "items", "photos", "transfers", "qc"],
  cashier: ["items"],
  outlet_manager: ["items", "transfers"],
  manager: ALL_PERMISSIONS,
  founder: ALL_PERMISSIONS,
};

/** The set a person actually has: their own list when set, else the role's default. */
export function permissionsFor(role: string, own: readonly string[] | null | undefined): Permission[] {
  if (Array.isArray(own)) return ALL_PERMISSIONS.filter((k) => own.includes(k));
  return ROLE_DEFAULTS[role as Role] ?? [];
}

/** Which permission a path needs, or null when every signed-in person may use it (reference data, auth, tag images…). */
export function permissionForPath(path: string): Permission | null {
  // Longest prefix wins, so /api/admin/scorecard is Scorecard and not Settings.
  // One garment's own record (/api/items/<sku>) is shared: the Photos and print screens read it.
  if (/^\/api\/items\/[^/]+/.test(path)) return null;
  let best: { key: Permission; len: number } | null = null;
  for (const p of PERMISSIONS) for (const prefix of p.paths) {
    if ((path === prefix || path.startsWith(prefix + "/") || (prefix.startsWith("/api/") && path.startsWith(prefix + "?"))) && (!best || prefix.length > best.len)) best = { key: p.key, len: prefix.length };
  }
  return best?.key ?? null;
}

/** Where a person lands after signing in: the first screen they may open. */
export function homeFor(perms: readonly Permission[]): string {
  if (perms.includes("dashboard")) return "/dashboard";
  const first = PERMISSIONS.find((p) => perms.includes(p.key));
  return first ? first.paths[0] : "/tag";
}
