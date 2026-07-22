"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function SectionShell({
  title,
  description,
  icon,
  children,
  className,
  accent,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: "default" | "primary" | "export";
}) {
  const accentBorder =
    accent === "primary"
      ? "border-[color-mix(in_srgb,var(--primary)_28%,var(--border))]"
      : accent === "export"
        ? "border-[color-mix(in_srgb,var(--accent-teal)_24%,var(--border))]"
        : "border-[var(--border)]";

  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[var(--panel)] p-4 shadow-[var(--shadow-sm)]",
        accentBorder,
        className
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        {icon && (
          <div
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border bg-[var(--panel-2)] text-sm"
            style={{ borderColor: "var(--border)" }}
            aria-hidden
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight text-[var(--text)]">{title}</h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
