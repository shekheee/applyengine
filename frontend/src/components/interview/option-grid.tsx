"use client";

import { cn } from "./utils";
import { IconCheck } from "./icons";

export function OptionGrid<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string;
  hint?: string;
  options: Array<{ id: T; label: string; desc?: string }>;
  value: T;
  onChange: (id: T) => void;
  columns?: 1 | 2 | 3;
}) {
  const colClass =
    columns === 1 ? "grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{label}</legend>
      <div>
        <p className="text-sm font-medium text-[var(--text)]">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-[var(--muted)]">{hint}</p>}
      </div>
      <div className={cn("grid gap-2", colClass)}>
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.id)}
              className={cn(
                "group relative rounded-[var(--radius-md)] border px-4 py-3 text-left transition-all motion-reduce:transition-none",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--primary)_60%,transparent)]",
                selected
                  ? "border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_12%,var(--panel))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent),0_4px_24px_-8px_var(--glow-soft)]"
                  : "border-[var(--border)] bg-[var(--panel-2)]/60 hover:border-[var(--border-strong)] hover:bg-[var(--panel-2)]"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-sm font-medium">{opt.label}</span>
                  {opt.desc && (
                    <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted)]">
                      {opt.desc}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all motion-reduce:transition-none",
                    selected
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-[var(--border)] bg-transparent opacity-0 group-hover:opacity-40"
                  )}
                  aria-hidden
                >
                  {selected && <IconCheck className="h-3 w-3" strokeWidth={2.5} />}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SegmentControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--text)]">{label}</p>
      <div
        className="inline-flex w-full flex-wrap gap-1 rounded-[var(--radius-lg)] border bg-[var(--panel)]/80 p-1 sm:w-auto"
        style={{ borderColor: "var(--border)" }}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.id)}
              className={cn(
                "flex-1 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition-all motion-reduce:transition-none sm:flex-none",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color-mix(in_srgb,var(--primary)_60%,transparent)]",
                selected
                  ? "bg-[color-mix(in_srgb,var(--primary)_22%,var(--panel-2))] text-[var(--text)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_45%,transparent)]"
                  : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
