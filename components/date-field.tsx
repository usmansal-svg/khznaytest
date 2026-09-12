"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A date picker that reads "Wed, Sep 16 2026" (the browser's own date input
 * shows numbers only). Value is YYYY-MM-DD; a small calendar opens on tap.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatDay(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return "Pick a date";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()} ${d.getFullYear()}`;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function DateField({ value, onChange, className, label }: { value: string; onChange: (v: string) => void; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const today = new Date();
  const [view, setView] = useState({ y: parsed ? Number(parsed[1]) : today.getFullYear(), m: parsed ? Number(parsed[2]) - 1 : today.getMonth() });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (parsed) setView({ y: Number(parsed[1]), m: Number(parsed[2]) - 1 });
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button type="button" aria-label={label} onClick={() => setOpen((o) => !o)} className={cn("flex h-10 items-center gap-2 rounded-md px-3 text-sm tabular-nums hover:bg-muted", !parsed && "text-muted-foreground")}>
        <CalendarDays className="size-4 text-muted-foreground" />{formatDay(value)}
      </button>
      {open && (
        <div className="absolute left-0 top-11 z-40 w-64 rounded-md border bg-background p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between">
            <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))} aria-label="Previous month"><ChevronLeft className="size-4" /></button>
            <span className="text-sm font-semibold">{MONTHS[view.m]} {view.y}</span>
            <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))} aria-label="Next month"><ChevronRight className="size-4" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] uppercase text-muted-foreground">{DAYS.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 text-center text-sm">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const v = iso(view.y, view.m, d);
              return <button key={i} type="button" onClick={() => { onChange(v); setOpen(false); }} className={cn("mx-auto my-0.5 size-8 rounded-full tabular-nums hover:bg-muted", v === value && "bg-foreground text-background hover:bg-foreground", v === todayIso && v !== value && "font-bold underline underline-offset-4")}>{d}</button>;
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs">
            <button type="button" className="rounded px-2 py-1 text-muted-foreground hover:bg-muted" onClick={() => { onChange(todayIso); setOpen(false); }}>Today</button>
            <button type="button" className="rounded px-2 py-1 text-muted-foreground hover:bg-muted" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
