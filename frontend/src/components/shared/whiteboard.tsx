"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import type { BoardElement } from "./whiteboard-canvas";

export type { BoardElement };

const Canvas = dynamic(() => import("./whiteboard-canvas"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-[var(--muted)]">Loading whiteboard…</p>,
});

const AUTOSAVE_MS = 1500;

export function loadBoard(key: string): BoardElement[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as BoardElement[]) : [];
  } catch {
    return [];
  }
}

export function clearBoard(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

/**
 * An Excalidraw whiteboard. With `draftKey` the drawing autosaves locally so
 * a reload keeps it; `onChange` receives the live (non-deleted) elements.
 */
export function Whiteboard({
  initialElements,
  onChange,
  draftKey,
  readOnly = false,
  className,
}: {
  initialElements: BoardElement[];
  onChange?: (elements: BoardElement[]) => void;
  draftKey?: string;
  readOnly?: boolean;
  className?: string;
}) {
  const pending = useRef<BoardElement[] | null>(null);

  useEffect(() => {
    if (!draftKey || readOnly) return;
    const timer = window.setInterval(() => {
      if (!pending.current) return;
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(pending.current));
        pending.current = null;
      } catch {
        // Quota or privacy mode; the drawing stays in memory.
      }
    }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [draftKey, readOnly]);

  return (
    <div className={className ?? "h-full min-h-[320px]"}>
      <Canvas
        initialElements={initialElements}
        readOnly={readOnly}
        onChange={(elements) => {
          pending.current = elements;
          onChange?.(elements);
        }}
      />
    </div>
  );
}
