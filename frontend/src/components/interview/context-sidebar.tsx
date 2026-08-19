"use client";

import type { Job, Profile, InterviewSession } from "@/lib/types";
import { Card } from "@/components/ui";
import { cn } from "./utils";

export function ContextSidebar({
  profile,
  pastSessions,
  onOpenSession,
  onRenameSession,
  onArchiveSession,
  onDeleteSession,
  className,
}: {
  profile: Profile | null;
  pastSessions: InterviewSession[];
  onOpenSession: (session: InterviewSession) => void;
  onRenameSession?: (session: InterviewSession) => void;
  onArchiveSession?: (session: InterviewSession) => void;
  onDeleteSession?: (session: InterviewSession) => void;
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
                <div className="group flex items-center gap-2 px-4 py-3 transition-colors hover:bg-[var(--panel-2)]">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                    onClick={() => onOpenSession(s)}
                  >
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {s.title || s.focus.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {s.mode === "live" ? "Live" : "Text"} · {s.status} · {new Date(s.created_at).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                  {s.summary?.overall_score != null && (
                    <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2 py-0.5 text-xs font-semibold tabular-nums">
                      {s.summary.overall_score}/10
                    </span>
                  )}
                  </button>
                  <details className="relative shrink-0">
                    <summary className="cursor-pointer list-none rounded px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--panel-3)]" aria-label="Session actions">
                      ···
                    </summary>
                    <div className="absolute right-0 z-20 mt-1 w-28 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-lg">
                      {onRenameSession && <button type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--panel-2)]" onClick={() => onRenameSession(s)}>Rename</button>}
                      {onArchiveSession && <button type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--panel-2)]" onClick={() => onArchiveSession(s)}>Archive</button>}
                      {onDeleteSession && <button type="button" className="block w-full px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10" onClick={() => onDeleteSession(s)}>Delete</button>}
                    </div>
                  </details>
                </div>
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
