"use client";

import type { InterviewSession } from "@/lib/types";
import { curriculumTopicLabel } from "@/lib/types";
import { Button, Card } from "@/components/ui";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ScoreRing10 } from "./conversation-thread";
import { summaryMarkdown } from "./summary-markdown";
import { cn, scoreBgClass, scoreColor } from "./utils";
import { IconChart, IconTarget } from "./icons";

function SummarySection({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "green" | "warn";
}) {
  if (!items.length) return null;
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border p-4",
        tone === "green" && "border-emerald-500/20 bg-emerald-500/5",
        tone === "warn" && "border-amber-500/20 bg-amber-500/5",
        tone === "default" && "border-[var(--border)] bg-[var(--panel-2)]/50"
      )}
    >
      <h3
        className={cn(
          "mb-3 text-sm font-semibold",
          tone === "green" && "text-emerald-300",
          tone === "warn" && "text-amber-300"
        )}
      >
        {title}
      </h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--muted)]" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionScoreBar({
  score,
  label,
  feedback,
}: {
  score: number | string | undefined;
  label: string;
  feedback?: string;
}) {
  const num = score != null ? Number(score) : null;
  const pct = num != null && !Number.isNaN(num) ? (num / 10) * 100 : 0;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-2)]/50 px-4 py-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm leading-snug text-[var(--text-secondary)]">{label}</p>
        {num != null && !Number.isNaN(num) && (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
              scoreBgClass(num)
            )}
          >
            {num}/10
          </span>
        )}
      </div>
      {num != null && !Number.isNaN(num) && (
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-3)]">
          <div
            className="h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none"
            style={{ width: `${pct}%`, backgroundColor: scoreColor(num) }}
          />
        </div>
      )}
      {feedback && (
        <p className="mt-2 text-xs italic leading-relaxed text-[var(--muted)]">{feedback}</p>
      )}
    </div>
  );
}

export function SummaryView({
  session,
  onReset,
}: {
  session: InterviewSession;
  onReset: () => void;
}) {
  const summary = session.summary;
  const overall =
    summary.overall_score != null ? Number(summary.overall_score) : session.overall_score;

  return (
    <div className="space-y-6 motion-reduce:animate-none animate-fade-up">
      <div className="overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--panel)] shadow-[var(--shadow-md)]">
        <div className="relative px-6 py-8 sm:px-8">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[color-mix(in_srgb,var(--primary)_18%,transparent)] via-transparent to-[color-mix(in_srgb,var(--accent-teal)_10%,transparent)]"
            aria-hidden
          />
          <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-center sm:text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Session complete
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Performance summary</h2>
              <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                Review your scores, strengths, and priority improvements before your next session.
              </p>
            </div>
            <ScoreRing10 score={overall != null && !Number.isNaN(overall) ? overall : null} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SummarySection title="Top strengths" items={summary.strengths ?? []} tone="green" />
        <SummarySection
          title="Priority improvements"
          items={summary.priority_improvements ?? []}
          tone="warn"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SummarySection title="Recurring patterns" items={summary.recurring_weaknesses ?? []} />
        <SummarySection title="Skill enhancement pointers" items={summary.skill_pointers ?? []} />
      </div>

      {summary.next_steps && summary.next_steps.length > 0 && (
        <Card className="border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,var(--panel))]">
          <div className="mb-3 flex items-center gap-2">
            <IconTarget className="h-4 w-4 text-[var(--primary-2)]" />
            <h3 className="text-sm font-semibold">Next steps</h3>
          </div>
          <ul className="space-y-2">
            {summary.next_steps.map((step, i) => (
              <li key={i} className="flex gap-2 text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--primary-2)]">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.per_question && summary.per_question.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <IconChart className="h-4 w-4 text-[var(--muted)]" />
            <h3 className="text-sm font-semibold">Question scores</h3>
          </div>
          <div className="space-y-2">
            {summary.per_question.map((pq, i) => (
              <QuestionScoreBar
                key={i}
                score={pq.score}
                label={
                  (pq.topic ? `${curriculumTopicLabel(pq.topic)} · ` : "") +
                  (pq.question ?? "").slice(0, 120)
                }
                feedback={pq.key_feedback}
              />
            ))}
          </div>
        </div>
      )}

      {summary.topic_scores && Object.keys(summary.topic_scores).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">AI/ML topic scores</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(summary.topic_scores).map(([tid, sc]) => {
              const num = Number(sc);
              return (
                <QuestionScoreBar
                  key={tid}
                  score={num}
                  label={curriculumTopicLabel(tid)}
                />
              );
            })}
          </div>
        </div>
      )}

      {session.recurring_weaknesses.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Recurring weaknesses to work on</h3>
          <ul className="space-y-2">
            {session.recurring_weaknesses.map((w, i) => (
              <li key={i} className="text-sm leading-relaxed text-[var(--muted)]">
                {w}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="prose-chat">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Full report
        </p>
        <ChatMarkdown content={summaryMarkdown(summary)} />
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onReset} variant="gradient">
          Start new session
        </Button>
        <Button variant="outline" href="/coach">
          Back to Coach
        </Button>
      </div>
    </div>
  );
}
