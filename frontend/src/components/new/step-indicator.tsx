"use client";

import { cn } from "@/components/ui";

export type StepStatus = "complete" | "current" | "upcoming";

export type FlowStep = {
  id: number;
  label: string;
  shortLabel: string;
  status: StepStatus;
};

function StepIcon({ status, index }: { status: StepStatus; index: number }) {
  if (status === "complete") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden
        className="text-emerald-300"
      >
        <path
          d="M2.5 7.2L5.8 10.5L11.5 3.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <span className="text-[11px] font-semibold tabular-nums leading-none">{index}</span>
  );
}

export function StepIndicator({ steps }: { steps: FlowStep[] }) {
  return (
    <nav aria-label="Application setup progress" className="mb-8">
      <ol className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const connectorComplete = step.status === "complete";

          return (
            <li
              key={step.id}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col",
                !isLast && "sm:pr-4"
              )}
              aria-current={step.status === "current" ? "step" : undefined}
            >
              <div className="flex items-start gap-3 sm:flex-col sm:items-stretch sm:gap-0">
                <div className="flex items-center gap-3 sm:mb-3">
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors duration-200",
                      step.status === "complete" &&
                        "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
                      step.status === "current" &&
                        "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--text)] shadow-[0_0_0_4px_var(--glow-soft)]",
                      step.status === "upcoming" &&
                        "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)]"
                    )}
                  >
                    <StepIcon status={step.status} index={step.id} />
                  </span>

                  {!isLast && (
                    <div
                      className={cn(
                        "hidden h-px flex-1 sm:block",
                        connectorComplete ? "bg-emerald-500/35" : "bg-[var(--border)]"
                      )}
                      aria-hidden
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-0.5 sm:pt-0">
                  <p
                    className={cn(
                      "text-sm font-medium leading-tight",
                      step.status === "current" && "text-[var(--text)]",
                      step.status === "complete" && "text-emerald-200/90",
                      step.status === "upcoming" && "text-[var(--muted)]"
                    )}
                  >
                    <span className="sm:hidden">{step.shortLabel}</span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </p>
                  {step.status === "current" && (
                    <p className="mt-1 text-xs text-[var(--muted-2)]">In progress</p>
                  )}
                  {step.status === "complete" && (
                    <p className="mt-1 text-xs text-emerald-400/70">Complete</p>
                  )}
                </div>
              </div>

              {!isLast && (
                <div
                  className={cn(
                    "ml-4 h-6 w-px sm:hidden",
                    connectorComplete ? "bg-emerald-500/35" : "bg-[var(--border)]"
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
