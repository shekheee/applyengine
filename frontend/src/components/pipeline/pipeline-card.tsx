"use client";

import Link from "next/link";
import type { Application, Job, Status } from "@/lib/types";
import { STATUSES, STATUS_LABELS } from "@/lib/types";
import { Select, cn } from "@/components/ui";
import { STATUS_CONFIG, companyInitial, fitColor } from "./constants";

type PipelineCardProps = {
  application: Application;
  job: Job | undefined;
  onStatusChange: (id: number, status: Status) => void;
  index: number;
};

export function PipelineCard({
  application: app,
  job,
  onStatusChange,
  index,
}: PipelineCardProps) {
  const config = STATUS_CONFIG[app.status];
  const initial = companyInitial(job?.company);

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-md)] border bg-[var(--panel-2)]",
        "motion-safe:transition-[border-color,box-shadow,transform] motion-safe:duration-200",
        "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] motion-safe:hover:-translate-y-0.5",
        "focus-within:ring-2 focus-within:ring-[var(--primary)]/40 focus-within:ring-offset-1 focus-within:ring-offset-[var(--bg)]"
      )}
      style={{
        borderColor: "var(--border)",
        animationDelay: `${index * 40}ms`,
      }}
    >
      <div
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: config.accent }}
        aria-hidden
      />

      <div className="p-3 pl-4">
        <div className="flex items-start gap-3">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-xs font-semibold tracking-tight"
            style={{
              backgroundColor: config.accentMuted,
              color: config.accent,
            }}
            aria-hidden
          >
            {initial}
          </div>

          <div className="min-w-0 flex-1">
            <Link
              href={`/applications/${app.id}`}
              className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold leading-snug text-[var(--text)] group-hover:text-[var(--text-secondary)] motion-safe:transition-colors">
                  {job?.title || "Role"}
                </h3>
                <FitBadge score={app.fit_score} />
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                {job?.company || "—"}
                {job?.location ? ` · ${job.location}` : ""}
              </p>
            </Link>

            <div className="mt-3 flex items-center gap-2">
              <label htmlFor={`status-${app.id}`} className="sr-only">
                Change status for {job?.title || "application"}
              </label>
              <Select
                id={`status-${app.id}`}
                value={app.status}
                onChange={(e) => onStatusChange(app.id, e.target.value as Status)}
                className="!min-h-0 flex-1 !py-1.5 !pl-2 !pr-7 text-xs"
                aria-label={`Status for ${job?.title || "application"}`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
              <Link
                href={`/applications/${app.id}`}
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border text-[var(--muted)]",
                  "motion-safe:transition-[color,background,border-color,transform] motion-safe:duration-150",
                  "hover:border-[var(--border-strong)] hover:bg-[var(--panel-3)] hover:text-[var(--text)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50",
                  "opacity-0 motion-safe:group-hover:opacity-100 motion-safe:group-focus-within:opacity-100",
                  "max-sm:opacity-100"
                )}
                style={{ borderColor: "var(--border)" }}
                aria-label={`Open ${job?.title || "application"} workspace`}
              >
                <ArrowIcon />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function FitBadge({ score }: { score: number | null }) {
  const color = fitColor(score);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
      }}
    >
      {score ?? "–"}
      <span className="font-normal opacity-70">fit</span>
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M4.5 9.5L9.5 4.5M9.5 4.5H5.5M9.5 4.5V8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
