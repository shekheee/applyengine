"use client";

import { Badge } from "@/components/ui";
import { cn } from "./utils";
import { IconSparkles } from "./icons";

export function QuestionCard({
  index,
  total,
  text,
  category,
  tip,
  trackLabel,
}: {
  index: number;
  total: number;
  text: string;
  category: string;
  tip?: string;
  trackLabel?: string;
}) {
  const progress = ((index + 1) / total) * 100;

  return (
    <article
      className="relative overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--panel)] p-6 shadow-[var(--shadow-sm)] motion-reduce:animate-none animate-fade-up"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--primary)] via-[var(--primary-2)] to-[var(--accent-teal)]"
        aria-hidden
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          Question {index + 1}
        </span>
        <Badge tone="primary">{category}</Badge>
        {trackLabel && <Badge tone="green">{trackLabel}</Badge>}
      </div>
      <p className="text-lg font-medium leading-snug tracking-tight sm:text-xl">{text}</p>
      {tip && (
        <div
          className="mt-4 flex gap-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent-teal)_30%,var(--border))] bg-[color-mix(in_srgb,var(--accent-teal)_8%,var(--panel-2))] px-4 py-3"
        >
          <IconSparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-teal)]" />
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--accent-teal)]">Coach tip · </span>
            {tip}
          </p>
        </div>
      )}
      <div className="mt-6">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
          <span>Session progress</span>
          <span className="tabular-nums">
            {index + 1} / {total}
          </span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-3)]"
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={1}
          aria-valuemax={total}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)] transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </article>
  );
}

export function SessionMetaBadges({
  difficulty,
  company,
  className,
}: {
  difficulty: string;
  company?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Badge tone="default" >
        {difficulty}
      </Badge>
      {company && <Badge tone="amber">{company}</Badge>}
    </div>
  );
}
