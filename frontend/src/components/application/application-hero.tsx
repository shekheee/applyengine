"use client";

import { Button, cn } from "@/components/ui";
import { STATUSES, type Application, type Job, type Status } from "@/lib/types";
import { STATUS_STYLES } from "./status-config";

export function ApplicationHero({
  job,
  app,
  onStatusChange,
}: {
  job: Job;
  app: Application;
  onStatusChange: (status: Status) => void;
}) {
  const statusStyle = STATUS_STYLES[app.status];
  const monogram = job.company.trim().charAt(0).toUpperCase() || "?";

  const meta: string[] = [];
  if (job.location) meta.push(job.location);
  if (job.seniority && job.seniority !== "unknown") meta.push(job.seniority);
  if (app.applied_at) {
    meta.push(
      `Applied ${new Date(app.applied_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    );
  }

  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--panel)]",
        "shadow-[var(--shadow-sm),inset_0_1px_0_rgba(255,255,255,0.04)]"
      )}
      style={{ borderColor: "var(--border)" }}
    >
      {/* Top accent rail */}
      <div
        className="h-[3px] w-full [background-image:var(--gradient-brand)]"
        aria-hidden
      />

      <div className="p-6 sm:p-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-2 text-sm">
            <li>
              <Button href="/" variant="ghost" size="sm" className="!px-2 !py-1">
                Pipeline
              </Button>
            </li>
            <li className="text-[var(--muted-2)]" aria-hidden>
              /
            </li>
            <li>
              <span className="truncate text-[var(--muted)]" aria-current="page">
                {job.company}
              </span>
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          {/* Identity block */}
          <div className="flex min-w-0 gap-4 sm:gap-5">
            <div
              className={cn(
                "grid h-14 w-14 shrink-0 place-items-center rounded-2xl border text-xl font-semibold tracking-tight sm:h-16 sm:w-16 sm:text-2xl",
                "bg-[var(--panel-2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                statusStyle.ring,
                "ring-2 ring-offset-2 ring-offset-[var(--panel)]"
              )}
              style={{ borderColor: "var(--border)" }}
              aria-hidden
            >
              {monogram}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--muted)]">
                {job.company}
              </p>
              <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-3xl lg:text-[2rem]">
                {job.title}
              </h1>

              {meta.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Role details">
                  {meta.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border bg-[var(--panel-2)] px-2.5 py-1 text-xs text-[var(--muted)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Status control */}
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <label
              htmlFor="application-status"
              className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]"
            >
              Pipeline status
            </label>
            <div className="relative">
              <span
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full",
                  statusStyle.dot
                )}
                aria-hidden
              />
              <select
                id="application-status"
                value={app.status}
                onChange={(e) => onStatusChange(e.target.value as Status)}
                className={cn(
                  "input-field appearance-none rounded-[var(--radius-md)] border bg-[var(--panel-2)]",
                  "py-2.5 pl-8 pr-10 text-sm font-medium outline-none",
                  "min-w-[160px] cursor-pointer transition-[border-color,box-shadow]"
                )}
                style={{ borderColor: "var(--border)" }}
                aria-label="Application status"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_STYLES[s].label}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
