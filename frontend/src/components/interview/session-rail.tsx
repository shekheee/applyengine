"use client";

import type { InterviewQuestion, InterviewTurn } from "@/lib/types";
import { Button } from "@/components/ui";
import { cn } from "./utils";

export function SessionRail({
  questions,
  turns,
  currentIndex,
  onReset,
}: {
  questions: InterviewQuestion[];
  turns: InterviewTurn[];
  currentIndex: number;
  onReset: () => void;
}) {
  function hasFeedback(i: number): boolean {
    return turns.some((t) => t.question_index === i && t.role === "feedback");
  }

  const completed = questions.filter((_, i) => hasFeedback(i)).length;

  return (
    <aside
      className="space-y-4 rounded-[var(--radius-xl)] border bg-[var(--panel)] p-4 shadow-[var(--shadow-sm)] lg:sticky lg:top-4"
      style={{ borderColor: "var(--border)" }}
      aria-label="Session question list"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            This session
          </p>
          <p className="mt-0.5 text-sm font-medium tabular-nums">
            {completed} of {questions.length} answered
          </p>
        </div>
        <div
          className="grid h-10 w-10 place-items-center rounded-full border text-xs font-semibold tabular-nums"
          style={{ borderColor: "var(--border)" }}
          aria-hidden
        >
          {Math.round((completed / questions.length) * 100)}%
        </div>
      </div>

      <ol className="space-y-1">
        {questions.map((q, i) => {
          const done = hasFeedback(i);
          const current = i === currentIndex;
          return (
            <li
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-[var(--radius-md)] px-2 py-2 text-xs transition-colors motion-reduce:transition-none",
                current && "bg-[color-mix(in_srgb,var(--primary)_12%,var(--panel-2))]",
                done && !current && "opacity-70"
              )}
              aria-current={current ? "step" : undefined}
            >
              <span
                className={cn(
                  "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                  done
                    ? "bg-emerald-500/20 text-emerald-300"
                    : current
                      ? "bg-[var(--primary)]/25 text-[var(--primary-2)]"
                      : "bg-[var(--panel-3)] text-[var(--muted)]"
                )}
                aria-hidden
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="min-w-0 leading-snug">
                <span className={cn("font-medium", current && "text-[var(--text)]")}>
                  Q{i + 1}
                </span>
                <span className="mt-0.5 block truncate text-[var(--muted)]">{q.text}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <Button variant="ghost" size="sm" onClick={onReset} className="w-full justify-center">
        ← New session
      </Button>
    </aside>
  );
}
