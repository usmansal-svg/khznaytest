"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Who is at the till and which outlet. Outlet staff are pinned to theirs;
 * HQ (manager / founder) picks one and every POS call carries ?outlet=.
 */
export type PosMe = {
  staff: { id: number; name: string; role: string };
  outlet: { id: number; name: string };
  can_manage: boolean;
  is_hq: boolean;
  outlets: { id: number; name: string }[];
  session: { id: number; opened_at: string; opening_float: number; opened_by: string | null } | null;
};

type Ctx = { me: PosMe | null; error: string | null; reload: () => Promise<void>; setOutlet: (id: number) => void; api: (path: string, init?: RequestInit) => Promise<Response> };
const PosCtx = createContext<Ctx | null>(null);

export function PosProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<PosMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outletId, setOutletId] = useState<number | null>(() => { try { const v = localStorage.getItem("khz_pos_outlet"); return v ? Number(v) : null; } catch { return null; } });

  const api = useCallback((path: string, init?: RequestInit) => {
    const url = new URL(path, window.location.origin);
    if (outletId) url.searchParams.set("outlet", String(outletId));
    return fetch(url.toString(), init);
  }, [outletId]);

  const reload = useCallback(async () => {
    try {
      const r = await api("/api/pos/me");
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Could not load the till."); setMe(null); return; }
      setMe(j); setError(null);
    } catch { setError("Could not reach the server."); }
  }, [api]);
  useEffect(() => { void reload(); }, [reload]);

  const setOutlet = (id: number) => { try { localStorage.setItem("khz_pos_outlet", String(id)); } catch { /* fine */ } setOutletId(id); };
  return <PosCtx.Provider value={{ me, error, reload, setOutlet, api }}>{children}</PosCtx.Provider>;
}

export function usePos() {
  const c = useContext(PosCtx);
  if (!c) throw new Error("usePos outside PosProvider");
  return c;
}

export const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
export const METHOD_LABELS: Record<string, string> = { cash: "Cash", card: "Card", jazzcash: "JazzCash", easypaisa: "Easypaisa", bank_transfer: "Bank transfer" };
