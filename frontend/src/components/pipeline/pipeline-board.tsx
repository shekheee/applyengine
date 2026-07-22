"use client";

import type { Application, Job, Status } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { PipelineColumn } from "./pipeline-column";

type PipelineBoardProps = {
  apps: Application[];
  jobs: Record<number, Job>;
  onStatusChange: (id: number, status: Status) => void;
};

export function PipelineBoard({ apps, jobs, onStatusChange }: PipelineBoardProps) {
  return (
    <div className="relative -mx-4 sm:-mx-6 xl:mx-0">
      <div
        className="overflow-x-auto overscroll-x-contain px-4 pb-2 sm:px-6 xl:overflow-visible xl:px-0"
        role="region"
        aria-label="Application kanban board"
        tabIndex={0}
      >
        <div className="flex min-w-min gap-4 xl:grid xl:min-w-0 xl:grid-cols-5 xl:gap-4">
          {STATUSES.map((status, i) => {
            const col = apps.filter((a) => a.status === status);
            return (
              <PipelineColumn
                key={status}
                status={status}
                applications={col}
                jobs={jobs}
                onStatusChange={onStatusChange}
                columnIndex={i}
              />
            );
          })}
        </div>
      </div>
      <p className="mt-2 px-4 text-center text-[11px] text-[var(--muted-2)] xl:hidden">
        Swipe to view all stages
      </p>
    </div>
  );
}
