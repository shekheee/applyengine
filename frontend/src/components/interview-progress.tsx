"use client";

import type { InterviewProgress } from "@/lib/types";
import { Badge, StatCard } from "@/components/ui";
import {
  ScoreTimelineChart,
  HorizontalScoreBar,
  ThemeChipList,
  focusLabel,
  curriculumTopicLabel,
} from "@/components/interview/score-chart";
import { IconChart } from "@/components/interview/icons";

export function InterviewProgressPanel({ progress }: { progress: InterviewProgress | null }) {
  if (!progress) return null;

  const hasData = progress.completed_sessions > 0;

  return (
    <section
      className="overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--panel)] shadow-[var(--shadow-sm)] motion-reduce:animate-none animate-fade-up"
      style={{ borderColor: "var(--border)" }}
      aria-labelledby="interview-progress-heading"
    >
      <div className="border-b border-[var(--border)] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-[var(--panel-2)] text-[var(--primary-2)]">
              <IconChart className="h-5 w-5" />
            </div>
            <div>
              <h2 id="interview-progress-heading" className="text-lg font-semibold tracking-tight">
                Your progress
              </h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Track improvement across interview sessions
              </p>
            </div>
          </div>
          {hasData && progress.trend !== "stable" && (
            <Badge tone={progress.trend === "improving" ? "green" : "amber"}>
              {progress.trend === "improving" ? "↑ Improving" : "↓ Needs focus"}
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-6 px-6 py-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Sessions" value={String(progress.completed_sessions)} accent="primary" />
          <StatCard
            label="Average score"
            value={progress.average_score != null ? `${progress.average_score}/10` : "—"}
            accent="default"
          />
          <StatCard
            label="Best score"
            value={progress.best_score != null ? `${progress.best_score}/10` : "—"}
            accent="green"
          />
          <StatCard
            label="Streak"
            value={
              progress.activity_streak_days > 0
                ? `${progress.activity_streak_days} day${progress.activity_streak_days === 1 ? "" : "s"}`
                : "—"
            }
            accent="amber"
          />
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold">Score over time</p>
          <ScoreTimelineChart points={progress.score_over_time} />
        </div>

        {Object.keys(progress.focus_averages).length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">By focus area</p>
            <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--panel-2)]/40 p-4">
              {Object.entries(progress.focus_averages).map(([focus, avg]) => (
                <HorizontalScoreBar
                  key={focus}
                  label={focusLabel(focus)}
                  score={avg}
                  highlight={focus === progress.weakest_focus_area ? "weak" : undefined}
                />
              ))}
            </div>
            {progress.weakest_focus_area && (
              <p className="text-xs text-[var(--muted)]">
                Weakest area:{" "}
                <strong className="text-amber-300">{focusLabel(progress.weakest_focus_area)}</strong>{" "}
                — prioritize practice here.
              </p>
            )}
          </div>
        )}

        {progress.topic_averages && Object.keys(progress.topic_averages).length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">AI/ML curriculum topics</p>
            <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--panel-2)]/40 p-4">
              {Object.entries(progress.topic_averages).map(([tid, avg]) => (
                <HorizontalScoreBar
                  key={tid}
                  label={progress.topic_labels?.[tid] ?? curriculumTopicLabel(tid)}
                  score={avg}
                  highlight={tid === progress.weakest_topic_area ? "weak" : undefined}
                />
              ))}
            </div>
            {progress.weakest_topic_area && (
              <p className="text-xs text-[var(--muted)]">
                Weakest topic:{" "}
                <strong className="text-amber-300">
                  {progress.topic_labels?.[progress.weakest_topic_area] ??
                    curriculumTopicLabel(progress.weakest_topic_area)}
                </strong>{" "}
                — drill here next.
              </p>
            )}
          </div>
        )}

        {progress.recurring_themes.length > 0 && (
          <ThemeChipList title="Recurring improvement themes" items={progress.recurring_themes} />
        )}

        {progress.skill_pointers.length > 0 && (
          <ThemeChipList title="Skill pointers to keep working on" items={progress.skill_pointers} />
        )}

        {progress.top_strengths.length > 0 && (
          <ThemeChipList
            title="Consistent strengths"
            items={progress.top_strengths}
            tone="green"
          />
        )}
      </div>
    </section>
  );
}
