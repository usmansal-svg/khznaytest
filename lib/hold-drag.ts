"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Press-and-hold, then drag, to reorder tiles in a grid — on a phone.
 *
 * The tile captures the pointer on hold (so the browser cannot turn the
 * movement into a scroll), a ghost of the tile follows the finger, and the
 * item slots in wherever the finger is over another tile. Tiles must carry
 * `data-key` and use `touch-action: none` while a drag is possible.
 */
export function useHoldDrag<T extends string | number>(keys: T[], onMove: (from: T, to: T) => void, onDrop?: () => void, holdMs = 220) {
  const [dragKey, setDragKey] = useState<T | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number; url?: string } | null>(null);
  const timer = useRef<number | null>(null);
  const captured = useRef<{ el: HTMLElement; id: number } | null>(null);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const clearTimer = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };

  const onPointerDown = useCallback((key: T, url?: string) => (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const id = e.pointerId;
    const start = { x: e.clientX, y: e.clientY };
    clearTimer();
    timer.current = window.setTimeout(() => {
      try { el.setPointerCapture(id); } catch { /* fine */ }
      captured.current = { el, id };
      const r = el.getBoundingClientRect();
      setGhost({ x: start.x - r.width / 2, y: start.y - r.height / 2, w: r.width, h: r.height, url });
      setDragKey(key);
      if (navigator.vibrate) navigator.vibrate(12);
    }, holdMs);
  }, [holdMs]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (dragKey == null) {
      // Moved before the hold completed: it is a scroll, not a drag.
      clearTimer();
      return;
    }
    e.preventDefault();
    setGhost((g) => (g ? { ...g, x: e.clientX - g.w / 2, y: e.clientY - g.h / 2 } : g));
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-key]");
    const over = under?.dataset.key;
    if (over == null) return;
    const overKey = (typeof dragKey === "number" ? Number(over) : over) as T;
    if (overKey !== dragKey && keysRef.current.includes(overKey)) onMove(dragKey, overKey);
  }, [dragKey, onMove]);

  const end = useCallback(() => {
    clearTimer();
    if (captured.current) { try { captured.current.el.releasePointerCapture(captured.current.id); } catch { /* fine */ } captured.current = null; }
    if (dragKey != null) onDrop?.();
    setDragKey(null);
    setGhost(null);
  }, [dragKey, onDrop]);

  return { dragKey, ghost, onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}
