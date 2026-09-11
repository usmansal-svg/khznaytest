"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Staff = { id: number; name: string; role: string; outlet_id: number | null; outlet: string | null; active: boolean; has_pin: boolean; last_login: string | null; daily_target: number | null };
type Outlet = { id: number; name: string };
const ROLES = [
  { code: "tagger", label: "Tagger" },
  { code: "qc_senior", label: "QC senior" },
  { code: "manager", label: "Manager" },
  { code: "founder", label: "Founder" },
  { code: "photographer", label: "Photographer" },
];

export function StaffAdmin() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("tagger");
  const [outletId, setOutletId] = useState("");
  const [pin, setPin] = useState("");

  async function load() {
    const res = await fetch("/api/admin/staff");
    const j = await res.json();
    if (!res.ok) return setError(j.error);
    setStaff(j.staff);
  }
  useEffect(() => {
    void load();
    fetch("/api/reference").then((r) => r.json()).then((j) => setOutlets(j.outlets ?? []));
  }, []);

  async function call(method: "POST" | "PATCH", body: unknown, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/staff", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMessage(ok);
      await load();
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-destructive">{error}</p>;
  if (!staff) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Staff</h1>
        <p className="text-sm text-muted-foreground">Everyone who tags signs in by name and PIN. The tagger&apos;s name goes on every garment for the grading audit.</p>
      </div>
      {message && <p className="rounded-md border bg-muted p-3 text-sm">{message}</p>}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="self-start">
          <CardHeader className="pb-3"><CardTitle className="text-base">Add someone</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1.5"><Label htmlFor="sn">Name</Label><Input id="sn" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="sr">Role</Label>
              <select id="sr" value={role} onChange={(e) => setRole(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">{ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="so">Home outlet</Label>
              <select id="so" value={outletId} onChange={(e) => setOutletId(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="">—</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="sp">PIN (4–6 digits)</Label><Input id="sp" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></div>
            <Button className="w-full" disabled={busy || !name.trim() || pin.length < 4} onClick={() => call("POST", { name, role, outlet_id: outletId ? Number(outletId) : null, pin }, `${name} added.`).then((ok) => ok && (setName(""), setPin("")))}>Add</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Everyone</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Name</th><th className="pb-2">Role</th><th className="pb-2">Outlet</th><th className="pb-2">Daily target</th><th className="pb-2">Last sign-in</th><th className="pb-2"></th></tr></thead>
              <tbody className="divide-y">
                {staff.map((s) => (
                  <tr key={s.id} className={cn(!s.active && "opacity-50")}>
                    <td className="py-2">{s.name}{!s.has_pin && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">no PIN</span>}</td>
                    <td className="py-2">
                      <select value={s.role} disabled={busy} onChange={(e) => call("PATCH", { id: s.id, role: e.target.value }, "Role changed.")} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">{ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>
                    </td>
                    <td className="py-2">
                      <select value={s.outlet_id ?? ""} disabled={busy} onChange={(e) => call("PATCH", { id: s.id, outlet_id: e.target.value ? Number(e.target.value) : null }, "Outlet changed.")} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"><option value="">—</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                    </td>
                    <td className="py-2"><Input type="number" min="1" step="5" defaultValue={s.daily_target ?? ""} placeholder="default" disabled={busy} onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== s.daily_target) void call("PATCH", { id: s.id, daily_target: v }, "Target saved."); }} className="h-8 w-24" /></td>
                    <td className="py-2 text-xs text-muted-foreground">{s.last_login ? new Date(s.last_login).toLocaleString("en-PK") : "never"}</td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { const p = window.prompt(`New PIN for ${s.name} (4–6 digits):`); if (p && /^\d{4,6}$/.test(p)) void call("PATCH", { id: s.id, pin: p }, "PIN reset."); }}>Reset PIN</Button>{" "}
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => call("PATCH", { id: s.id, active: !s.active }, s.active ? "Deactivated." : "Reactivated.")}>{s.active ? "Deactivate" : "Reactivate"}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
