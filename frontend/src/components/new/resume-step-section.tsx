"use client";

import { ResumeUpload } from "@/components/resume-upload";
import type { Profile } from "@/lib/types";
import { cn } from "@/components/ui";

export function ResumeStepSection({
  profile,
  onLoaded,
  className,
}: {
  profile: Profile | null;
  onLoaded: (p: Profile) => void;
  className?: string;
}) {
  return (
    <section
      id="step-resume"
      aria-labelledby="resume-step-title"
      className={cn("animate-fade-up", className)}
      style={{ animationDelay: "60ms" }}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-2)]">
            Step 1
          </p>
          <h2 id="resume-step-title" className="mt-1 text-lg font-semibold tracking-tight">
            Base resume
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Upload or paste your master resume — used across all applications.
          </p>
        </div>
        {profile && (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            Ready
          </span>
        )}
      </div>

      <div
        className={cn(
          "rounded-[var(--radius-xl)] border bg-[var(--panel)] p-1 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-200",
          profile
            ? "border-emerald-500/20"
            : "border-[var(--border)] focus-within:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))]"
        )}
      >
        <div className="rounded-[calc(var(--radius-xl)-4px)] bg-[var(--panel)]">
          <ResumeUpload onLoaded={onLoaded} />
        </div>
      </div>
    </section>
  );
}
