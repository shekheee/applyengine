"use client";

import { cn } from "@/components/ui";

const STYLES = [
  {
    id: "signature" as const,
    label: "Signature sidebar",
    desc: "Poppins · navy sidebar · reference layout",
    preview: "Sg",
  },
  {
    id: "editorial" as const,
    label: "Modern editorial",
    desc: "Indigo accent, Fraunces display, skill chips",
    preview: "Ed",
  },
  {
    id: "executive" as const,
    label: "Teal sidebar",
    desc: "Two-column layout, contact stack, depth",
    preview: "Sb",
  },
  {
    id: "minimal" as const,
    label: "Refined minimal",
    desc: "Centered serif, copper rule, column skills",
    preview: "Mn",
  },
];

export type ResumeDesignStyle = (typeof STYLES)[number]["id"];

export function StylePicker({
  value,
  onChange,
}: {
  value: ResumeDesignStyle;
  onChange: (style: ResumeDesignStyle) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
        Layout style
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Resume layout style">
        {STYLES.map((style) => {
          const active = value === style.id;
          return (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(style.id)}
              className={cn(
                "group relative flex flex-col rounded-[var(--radius-md)] border p-3 text-left transition-[border-color,background,box-shadow,transform] duration-200",
                "motion-safe:hover:-translate-y-px motion-safe:hover:shadow-[var(--shadow-sm)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--primary)_50%,transparent)]",
                active
                  ? "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_10%,var(--panel-2))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
                  : "border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--border-strong)]"
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text)]">{style.label}</span>
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-md border text-[10px] font-serif",
                    active
                      ? "border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] bg-white/10 text-[var(--primary-2)]"
                      : "border-[var(--border)] bg-[var(--panel-3)] text-[var(--muted)]"
                  )}
                  aria-hidden
                >
                  {style.preview}
                </span>
              </div>
              <span className="text-[11px] leading-snug text-[var(--muted)]">{style.desc}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
