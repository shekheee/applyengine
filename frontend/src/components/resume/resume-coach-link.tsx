"use client";

import { Button } from "@/components/ui";

export function ResumeCoachLink() {
  return (
    <div
      className="group relative overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--panel)] p-4 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-200 motion-safe:hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] motion-safe:hover:shadow-[var(--shadow-md)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] blur-2xl"
        aria-hidden
      />
      <div className="relative">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] border bg-[var(--panel-2)] text-sm"
            style={{ borderColor: "var(--border)" }}
            aria-hidden
          >
            📄
          </span>
          <h2 className="font-semibold tracking-tight">Resume studio</h2>
        </div>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Upload once, generate premium designs, preview the full Letter page, and export PDF or Word — all
          in the dedicated workspace.
        </p>
        <Button href="/resume" className="mt-4 w-full" variant="outline">
          Open Resume workspace →
        </Button>
      </div>
    </div>
  );
}
