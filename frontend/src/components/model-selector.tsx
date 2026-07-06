"use client";

import { useEffect, useRef, useState } from "react";
import type { CoachModel } from "@/lib/types";

const STORAGE_KEY = "applyengine_coach_model";

export function getStoredModelId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function storeModelId(id: string) {
  window.localStorage.setItem(STORAGE_KEY, id);
}

interface ModelSelectorProps {
  models: CoachModel[];
  selectedId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  models,
  selectedId,
  onChange,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = models.find((m) => m.id === selectedId) ?? models[0];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!selected) return null;

  const grouped = models.reduce<Record<string, CoachModel[]>>((acc, m) => {
    (acc[m.provider_label] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border bg-[var(--panel)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--panel-2)] disabled:opacity-50"
        style={{ borderColor: "var(--border)" }}
        title="Select model"
      >
        <span className="text-[var(--muted)]">{selected.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 z-50 mb-1 min-w-[220px] overflow-hidden rounded-xl border bg-[var(--panel)] py-1 shadow-xl shadow-black/40"
          style={{ borderColor: "var(--border)" }}
        >
          {Object.entries(grouped).map(([providerLabel, items]) => (
            <div key={providerLabel}>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                {providerLabel}
              </p>
              {items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    storeModelId(m.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--panel-2)] ${
                    m.id === selectedId ? "text-[var(--primary-2)]" : "text-[var(--text)]"
                  }`}
                >
                  <span>{m.label}</span>
                  {m.id === selectedId && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
