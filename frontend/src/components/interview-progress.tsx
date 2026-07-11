"use client";

import type { InterviewProgress } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { INTERVIEW_FOCUS, interviewFocusLabel } from "@/lib/types";

function focusLabel(id: string): string {
  return interviewFocusLabel(id);
}

function ScoreChart({ points }: { points: InterviewProgress["score_over_time"] }) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Complete a session to start tracking your scores.
      </p>
    );
  }

  const maxScore = 10;
  const barW = Math.max(24, Math.min(48, Math.floor(600 / points.length)));

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-end gap-1.5" style={{ minHeight: 120 }}>
        {points.map((p) => {
          const h = Math.max(8, (p.score / maxScore) * 100);
          return (
            <div
              key={p.session_id}
              className="flex flex-col items-center gap-1"
              style={{ width: barW }}
              title={`${p.date}: ${p.score}/10 (${focusLabel(p.focus)})`}
            >
              <span className="text-[10px] font-medium text-[var(--text)]">
                {p.score}
              </span>
              <div
                className="w-full rounded-t-md bg-[var(--primary)] transition-all"
                style={{ height: `${h}px`, opacity: 0.65 + (p.score / maxScore) * 0.35 }}
              />
              <span className="max-w-full truncate text-[9px] text-[var(--muted)]">
                {p.date.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InterviewProgressPanel({ progress }: { progress: InterviewProgress | null }) {
  if (!progress) return null;

  const hasData = progress.completed_sessions > 0;

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Your progress</h2>
          <p className="text-xs text-[var(--muted)]">
            Track improvement across interview sessions
          </p>
        </div>
        {hasData && progress.trend !== "stable" && (
          <Badge tone={progress.trend === "improving" ? "green" : "amber"}>
            {progress.trend === "improving" ? "↑ Improving" : "↓ Needs focus"}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sessions" value={String(progress.completed_sessions)} />
        <Stat
          label="Average score"
          value={progress.average_score != null ? `${progress.average_score}/10` : "—"}
        />
        <Stat
          label="Best score"
          value={progress.best_score != null ? `${progress.best_score}/10` : "—"}
        />
        <Stat
          label="Streak"
          value={
            progress.activity_streak_days > 0
              ? `${progress.activity_streak_days} day${progress.activity_streak_days === 1 ? "" : "s"}`
              : "—"
          }
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Score over time</p>
        <ScoreChart points={progress.score_over_time} />
      </div>

      {Object.keys(progress.focus_averages).length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">By focus area</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(progress.focus_averages).map(([focus, avg]) => (
              <span
                key={focus}
                className="rounded-lg border px-2.5 py-1 text-xs"
                style={{ borderColor: "var(--border)" }}
              >
                {focusLabel(focus)}: <strong>{avg}/10</strong>
              </span>
            ))}
          </div>
          {progress.weakest_focus_area && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Weakest area: {focusLabel(progress.weakest_focus_area)} — prioritize practice here.
            </p>
          )}
        </div>
      )}

      {progress.recurring_themes.length > 0 && (
        <ThemeList title="Recurring improvement themes" items={progress.recurring_themes} />
      )}

      {progress.skill_pointers.length > 0 && (
        <ThemeList title="Skill pointers to keep working on" items={progress.skill_pointers} />
      )}

      {progress.top_strengths.length > 0 && (
        <ThemeList title="Consistent strengths" items={progress.top_strengths} tone="green" />
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border px-3 py-2.5"
      style={{ borderColor: "var(--border)" }}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function ThemeList({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: Array<{ text: string; count: number }>;
  tone?: "default" | "green";
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.text}
            className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
              tone === "green" ? "border-green-500/20 bg-green-500/5" : ""
            }`}
            style={tone === "default" ? { borderColor: "var(--border)" } : undefined}
          >
            {item.text}
            {item.count > 1 && (
              <span className="ml-1.5 text-[var(--muted)]">×{item.count}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
