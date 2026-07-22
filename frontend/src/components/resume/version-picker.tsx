"use client";

import { cn } from "@/components/ui";
import type { ResumeVersion } from "@/lib/types";

export function VersionPicker({
  versions,
  value,
  onChange,
  label = "Active version",
  id = "resume-version-picker",
}: {
  versions: ResumeVersion[];
  value: number | "";
  onChange: (id: number | "") => void;
  label?: string;
  id?: string;
}) {
  if (versions.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed px-3 py-4 text-center text-xs leading-relaxed text-[var(--muted)]" style={{ borderColor: "var(--border)" }}>
        Upload a base resume first, then generate a designed version.
      </p>
    );
  }

  const selected = versions.find((v) => v.id === value);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
        {label}
      </label>

      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? "" : Number(v));
          }}
          className={cn(
            "input-field w-full appearance-none rounded-[var(--radius-md)] border bg-[var(--panel-2)] py-2.5 pl-3 pr-9 text-sm text-[var(--text)] outline-none transition-[border-color,box-shadow]",
            "focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]"
          )}
          style={{ borderColor: "var(--border)" }}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.kind === "base" ? "Base · " : "Designed · "}
              {v.title}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          aria-hidden
        >
          ▾
        </span>
      </div>

      {selected && (
        <div className="flex items-center gap-2 pt-1">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              selected.kind === "base"
                ? "bg-[var(--panel-3)] text-[var(--text-secondary)]"
                : "bg-[color-mix(in_srgb,var(--primary)_18%,var(--panel-2))] text-[var(--primary-2)]"
            )}
          >
            {selected.kind === "base" ? "Base upload" : "Designed"}
          </span>
          <span className="truncate text-xs text-[var(--muted-2)]">{selected.title}</span>
        </div>
      )}
    </div>
  );
}
