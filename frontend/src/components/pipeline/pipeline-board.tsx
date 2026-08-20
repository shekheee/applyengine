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
    <div className="relative">
      <div
        className="min-w-0"
        role="region"
        aria-label="Application kanban board"
      >
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-5">
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
    </div>
  );
}
