"use client";

import type { Application, Job, Status } from "@/lib/types";
import { cn } from "@/components/ui";
import { STATUS_CONFIG } from "./constants";
import { PipelineCard } from "./pipeline-card";

type PipelineColumnProps = {
  status: Status;
  applications: Application[];
  jobs: Record<number, Job>;
  onStatusChange: (id: number, status: Status) => void;
  columnIndex: number;
};

export function PipelineColumn({
  status,
  applications,
  jobs,
  onStatusChange,
  columnIndex,
}: PipelineColumnProps) {
  const config = STATUS_CONFIG[status];

  return (
    <section
      aria-label={`${config.label} column, ${applications.length} applications`}
      className={cn(
        "flex w-[min(100%,280px)] shrink-0 flex-col sm:w-[min(100%,260px)] xl:w-auto xl:min-w-0",
        "animate-fade-up motion-reduce:animate-none"
      )}
      style={{ animationDelay: `${columnIndex * 60}ms` }}
    >
      <header
        className="sticky top-0 z-10 mb-3 flex items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--panel)]/95 px-3 py-2.5 backdrop-blur-sm"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-[var(--panel)]"
          style={{
            backgroundColor: config.accent,
            boxShadow: `0 0 8px -2px ${config.accent}`,
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight text-[var(--text)]">
            {config.label}
          </h2>
          <p className="truncate text-[11px] text-[var(--muted-2)]">{config.description}</p>
        </div>
        <span
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums"
          style={{
            backgroundColor: config.accentMuted,
            color: config.accent,
          }}
          aria-label={`${applications.length} in ${config.label}`}
        >
          {applications.length}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-2 pb-2">
        {applications.map((app, i) => (
          <PipelineCard
            key={app.id}
            application={app}
            job={jobs[app.job_id]}
            onStatusChange={onStatusChange}
            index={i}
          />
        ))}

        {applications.length === 0 && (
          <div
            className="flex flex-1 flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed px-4 py-8 text-center"
            style={{ borderColor: "var(--border)", minHeight: "88px" }}
          >
            <p className="text-xs font-medium text-[var(--muted-2)]">No roles here</p>
            <p className="mt-1 text-[11px] text-[var(--muted-2)]/80">
              Move applications via status
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
