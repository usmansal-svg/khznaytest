"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Delete } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type StaffOption = { id: number; name: string; role: string };

/**
 * Shared-iPad sign-in: tap your name, type your PIN on a big keypad. On a
 * fresh install it asks the first person to set themselves up as founder.
 */
export function PinLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/tag";

  const [state, setState] = useState<{ configured: boolean; needs_setup: boolean; staff: StaffOption[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState<StaffOption | null>(null);
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/login")
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => (ok ? setState(j) : setError(j.error ?? "Could not load.")))
      .catch(() => setError("Could not reach the server."));
  }, []);

  async function submit(setup: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(setup ? { name, pin } : { staff_id: who?.id, pin }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Sign-in failed.");
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  // Auto-submit when the PIN reaches 4 digits for a known name.
  useEffect(() => {
    if (who && pin.length >= 4 && !busy) void submit(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (error && !state) return <Card><p className="text-sm text-destructive">{error}</p><p className="mt-2 text-xs text-muted-foreground">If this says the server key is missing, SUPABASE_SERVICE_ROLE_KEY is not set on the server.</p></Card>;
  if (!state) return <Card><p className="text-sm text-muted-foreground">Loading…</p></Card>;

  if (state.needs_setup) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Set up Khazanay</h1>
        <p className="mt-1 text-sm text-muted-foreground">You&apos;re the first person here, so you become the founder. Choose a 4–6 digit PIN — it&apos;s what you&apos;ll type on the iPad.</p>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="n">Your name</Label><Input id="n" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="grid gap-1.5"><Label htmlFor="p">PIN</Label><Input id="p" type="password" inputMode="numeric" pattern="\d*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></div>
          <div className="grid gap-1.5"><Label htmlFor="c">PIN again</Label><Input id="c" type="password" inputMode="numeric" pattern="\d*" maxLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="lg" disabled={busy || !name.trim() || pin.length < 4 || pin !== confirm} onClick={() => submit(true)}>Create founder & sign in</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-xl font-bold">Khazanay</h1>
      {!who ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">Who&apos;s tagging?</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {state.staff.map((s) => (
              <Button key={s.id} variant="outline" size="lg" className="h-14 text-base" onClick={() => setWho(s)}>{s.name}</Button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            <button className="underline" onClick={() => { setWho(null); setPin(""); setError(null); }}>← {who.name}</button> · enter your PIN
          </p>
          <div className="my-4 flex justify-center gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={cn("size-3.5 rounded-full border", i < pin.length && "bg-foreground", i >= 4 && pin.length <= i && "opacity-30")} />)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => (
              <Button key={i} variant={k === "" ? "ghost" : "outline"} size="lg" className="h-16 text-2xl" disabled={busy || k === ""} onClick={() => setPin((p) => (k === "⌫" ? p.slice(0, -1) : (p + k).slice(0, 6)))}>
                {k === "⌫" ? <Delete className="size-6" /> : k}
              </Button>
            ))}
          </div>
          {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}
          {busy && <p className="mt-3 text-center text-xs text-muted-foreground">Signing in…</p>}
        </>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">{children}</div>;
}
