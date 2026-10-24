"use client";

import type { ReactNode } from "react";
import { Badge, cn } from "@/components/ui";

export type ChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
  sublabel?: string;
  href?: string | null;
  linkLabel?: string;
  badge?: string | null;
  badgeTone?: "default" | "green" | "amber" | "red" | "primary";
  trailing?: ReactNode;
};

export function Checklist({
  items,
  onToggle,
  disabled,
  emptyText = "Nothing here.",
}: {
  items: ChecklistItem[];
  onToggle: (id: string, checked: boolean) => void;
  disabled?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="py-3 text-sm text-[var(--muted)]">{emptyText}</p>;
  }
  return (
    <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
      {items.map((item) => {
        const inputId = `check-${item.id}`;
        return (
          <li key={item.id} className="flex items-start gap-3 py-3">
            <input
              id={inputId}
              type="checkbox"
              checked={item.checked}
              disabled={disabled}
              onChange={(event) => onToggle(item.id, event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor={inputId}
                  className={cn(
                    "cursor-pointer text-sm font-medium",
                    item.checked ? "text-[var(--muted)] line-through" : "text-[var(--text)]"
                  )}
                >
                  {item.label}
                </label>
                {item.badge && <Badge tone={item.badgeTone}>{item.badge}</Badge>}
              </div>
              {item.sublabel && (
                <p className="mt-0.5 text-xs text-[var(--muted)]">{item.sublabel}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.href && (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[var(--primary-2)] hover:underline"
                >
                  {item.linkLabel ?? "Open"} ↗
                </a>
              )}
              {item.trailing}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
