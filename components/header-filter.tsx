"use client";

import { useEffect, useRef, useState } from "react";
import { Filter } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** An Excel-style column filter for a table heading: search, tick values, Select all, Clear. */
export function HeaderFilter({ label, values, selected, onChange, format }: { label: string; values: string[]; selected: Set<string>; onChange: (v: Set<string>) => void; format?: (v: string) => string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const show = (v: string) => (format ? format(v) : v);
  const shown = values.filter((v) => show(v).toLowerCase().includes(q.trim().toLowerCase()));
  const active = selected.size > 0;
  const toggle = (v: string) => { const n = new Set(selected); if (n.has(v)) n.delete(v); else n.add(v); onChange(n); };
  return (
    <div ref={ref} className="relative inline-block normal-case">
      <button type="button" onClick={() => setOpen((o) => !o)} className={cn("inline-flex items-center gap-1 rounded px-1 uppercase hover:bg-muted", active && "text-foreground")} title={active ? `Filtered: ${[...selected].map(show).join(", ")}` : `Filter ${label.toLowerCase()}`}>
        {label}
        <Filter className={cn("h-3 w-3", active ? "fill-current" : "opacity-50")} />
        {active && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{selected.size}</span>}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-60 rounded-md border bg-background p-2 text-sm shadow-lg">
          <Input autoFocus value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search…" className="mb-2 h-8" />
          <div className="mb-2 flex gap-3 text-xs">
            <button type="button" className="underline" onClick={() => onChange(new Set(shown))}>Select all{q ? " shown" : ""}</button>
            <button type="button" className="underline" onClick={() => onChange(new Set())}>Clear</button>
          </div>
          <div className="max-h-64 overflow-auto">
            {shown.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">Nothing matches.</p>}
            {shown.map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                <Checkbox checked={selected.has(v)} onCheckedChange={() => toggle(v)} />
                <span className="truncate">{show(v)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

