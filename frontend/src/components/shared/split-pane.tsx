"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

function readRatio(key: string | undefined, fallback: number): number {
  if (!key) return fallback;
  try {
    const value = Number(window.localStorage.getItem(key));
    return value > 0 && value < 1 ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Two panes with a draggable divider, like an IDE. Horizontal splits stack
 * vertically below the `lg` breakpoint; the ratio is remembered per storageKey.
 */
export function SplitPane({
  first,
  second,
  direction = "horizontal",
  initial = 0.5,
  min = 0.2,
  max = 0.8,
  storageKey,
  className,
}: {
  first: ReactNode;
  second: ReactNode;
  direction?: "horizontal" | "vertical";
  initial?: number;
  min?: number;
  max?: number;
  storageKey?: string;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() =>
    typeof window === "undefined" ? initial : readRatio(storageKey, initial)
  );
  const [dragging, setDragging] = useState(false);
  const horizontal = direction === "horizontal";

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setDragging(true);
    let latest = ratio;
    const move = (e: PointerEvent) => {
      const box = container.current?.getBoundingClientRect();
      if (!box) return;
      const raw = horizontal ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height;
      latest = Math.min(max, Math.max(min, raw));
      setRatio(latest);
    };
    const up = () => {
      setDragging(false);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, String(latest));
        } catch {
          // Storage unavailable; the split resets next visit.
        }
      }
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const back = horizontal ? "ArrowLeft" : "ArrowUp";
    const forward = horizontal ? "ArrowRight" : "ArrowDown";
    if (event.key !== back && event.key !== forward) return;
    event.preventDefault();
    setRatio((r) => Math.min(max, Math.max(min, r + (event.key === forward ? step : -step))));
  };

  const firstSize = `${(ratio * 100).toFixed(2)}%`;

  return (
    <div
      ref={container}
      className={cn(
        "flex min-h-0 min-w-0",
        horizontal ? "flex-col lg:flex-row" : "h-full flex-col",
        dragging && "select-none",
        className
      )}
      style={{ ["--split" as string]: firstSize }}
    >
      <div
        className={cn(
          "min-h-0 min-w-0 overflow-hidden",
          horizontal ? "lg:shrink-0 lg:basis-[var(--split)]" : "shrink-0 basis-[var(--split)]"
        )}
      >
        {first}
      </div>
      <div
        role="separator"
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round(max * 100)}
        aria-label="Resize panels"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className={cn(
          "group relative shrink-0 touch-none outline-none",
          horizontal ? "hidden w-2 cursor-col-resize lg:block" : "h-2 cursor-row-resize"
        )}
      >
        <span
          className={cn(
            "absolute rounded-full bg-[var(--border-strong)] transition-colors group-hover:bg-[var(--primary)] group-focus-visible:bg-[var(--primary)]",
            dragging && "bg-[var(--primary)]",
            horizontal ? "inset-y-2 left-1/2 w-0.5 -translate-x-1/2" : "inset-x-2 top-1/2 h-0.5 -translate-y-1/2"
          )}
        />
      </div>
      <div className={cn("min-h-0 min-w-0 flex-1 overflow-hidden", horizontal && "mt-2 lg:mt-0")}>{second}</div>
    </div>
  );
}
