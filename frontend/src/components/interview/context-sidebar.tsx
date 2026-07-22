"use client";

import type { Job, Profile, InterviewSession } from "@/lib/types";
import { Card } from "@/components/ui";
import { cn } from "./utils";

export function ContextSidebar({
  profile,
  pastSessions,
  onOpenSession,
  className,
}: {
  profile: Profile | null;
  pastSessions: InterviewSession[];
  onOpenSession: (session: InterviewSession) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {profile && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--panel))] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Base resume
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm font-medium">{profile.name || "Your profile"}</p>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[var(--muted)]">
              {profile.summary || profile.raw_text?.slice(0, 160)}
            </p>
          </div>
        </Card>
      )}

      {pastSessions.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Recent sessions
            </p>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {pastSessions.slice(0, 5).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--panel-2)] motion-reduce:transition-none"
                  onClick={() => onOpenSession(s)}
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-medium capitalize">{s.focus.replace(/_/g, " ")}</span>
                    <span className="text-xs text-[var(--muted)]">{s.status}</span>
                  </div>
                  {s.summary?.overall_score != null && (
                    <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2 py-0.5 text-xs font-semibold tabular-nums">
                      {s.summary.overall_score}/10
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export function JobContextNote() {
  return (
    <div className="rounded-[var(--radius-md)] border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-100">
      Session will use this application&apos;s job description for tailored questions.
    </div>
  );
}

export function JobSelector({
  jobs,
  jobId,
  onChange,
}: {
  jobs: Job[];
  jobId: number | "";
  onChange: (id: number | "") => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor="interview-job-select" className="text-sm font-medium">
        Target role <span className="font-normal text-[var(--muted)]">(optional)</span>
      </label>
      <select
        id="interview-job-select"
        value={jobId}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
        className="input-field w-full rounded-[var(--radius-md)] border bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none"
        style={{ borderColor: "var(--border)" }}
      >
        <option value="">General (resume only)</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>
            {j.title} @ {j.company}
          </option>
        ))}
      </select>
    </div>
  );
}
