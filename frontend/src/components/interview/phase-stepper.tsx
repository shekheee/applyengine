"use client";

import { cn } from "./utils";

const STEPS = [
  { id: "setup" as const, label: "Configure", desc: "Focus & difficulty" },
  { id: "practice" as const, label: "Practice", desc: "Answer & feedback" },
  { id: "summary" as const, label: "Summary", desc: "Scores & next steps" },
];

export function PhaseStepper({
  phase,
  compact = false,
  liveMode = false,
}: {
  phase: "setup" | "practice" | "summary";
  compact?: boolean;
  liveMode?: boolean;
}) {
  const activeIdx = STEPS.findIndex((s) => s.id === phase);

  return (
    <nav
      aria-label="Interview session progress"
      className={cn("w-full", compact ? "mb-4" : "mb-8")}
    >
      <ol className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <li
              key={step.id}
              className={cn("flex min-w-0 flex-1 items-center", i < STEPS.length - 1 && "flex-1")}
            >
              <div className="flex min-w-0 flex-col items-center gap-1 sm:flex-row sm:gap-3">
                <div
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums transition-colors motion-reduce:transition-none",
                    done && "border-[var(--green)] bg-emerald-500/15 text-emerald-300",
                    active &&
                      "border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--primary-2)] shadow-[0_0_20px_-4px_var(--glow-soft)]",
                    !done && !active && "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)]"
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? "✓" : i + 1}
                </div>
                {!compact && (
                  <div className="hidden min-w-0 text-center sm:block sm:text-left">
                    <p
                      className={cn(
                        "text-xs font-medium",
                        active ? "text-[var(--text)]" : "text-[var(--muted)]"
                      )}
                    >
                      {step.id === "practice" && liveMode ? "Live interview" : step.label}
                    </p>
                    <p className="hidden text-[10px] text-[var(--muted-2)] lg:block">
                      {step.id === "practice" && liveMode ? "Voice Q&A with AI interviewer" : step.desc}
                    </p>
                  </div>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-px flex-1 min-w-[16px] transition-colors motion-reduce:transition-none",
                    done ? "bg-[var(--green)]/50" : "bg-[var(--border)]"
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
