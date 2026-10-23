"use client";

import type { CaseScorecard as CaseScorecardData } from "@/lib/types";
import { cn, scoreBgClass } from "./utils";

const STEP_MAX = 3;

function stepTone(score: number): string {
  if (score >= 3) return "var(--green)";
  if (score >= 2) return "var(--amber)";
  return "var(--red)";
}

function SignalPill({ label, count, target }: { label: string; count: number; target: number }) {
  const ok = count >= target;
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border px-3 py-2",
        ok ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5"
      )}
    >
      <p className="text-lg font-semibold tabular-nums">{count}</p>
      <p className="text-xs text-[var(--muted)]">
        {label} <span className="opacity-70">(aim ≥ {target})</span>
      </p>
    </div>
  );
}

export function CaseScorecard({ card }: { card: CaseScorecardData }) {
  const sizing = card.value_sizing;
  const signals = card.structure_signals;

  return (
    <div className="space-y-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--panel-2)]/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Seven-step case framework
          </p>
          {card.case_title && <h3 className="mt-1 text-base font-semibold">{card.case_title}</h3>}
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-sm font-semibold tabular-nums",
            scoreBgClass(card.framework_score)
          )}
        >
          {card.framework_score}/10
        </span>
      </div>

      <ol className="space-y-2">
        {card.steps.map((step, i) => (
          <li key={step.step} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <p className="min-w-0 text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--muted)]">{i + 1}.</span> {step.title}
            </p>
            <span className="text-xs font-semibold tabular-nums" style={{ color: stepTone(step.score) }}>
              {step.score}/{STEP_MAX}
            </span>
            <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[var(--panel-3)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${(step.score / STEP_MAX) * 100}%`, backgroundColor: stepTone(step.score) }}
              />
            </div>
            {step.evidence && (
              <p className="col-span-2 text-xs italic leading-relaxed text-[var(--muted)]">{step.evidence}</p>
            )}
          </li>
        ))}
      </ol>

      <div
        className={cn(
          "rounded-[var(--radius-md)] border px-4 py-3 text-sm",
          sizing.status === "complete"
            ? "border-emerald-500/25 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/8"
        )}
      >
        <p className="font-medium">
          Value sizing ·{" "}
          {sizing.status === "complete"
            ? "complete"
            : sizing.status === "partial"
              ? `partial — missing ${sizing.missing.join(", ")}`
              : "missing"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          {sizing.evidence
            ? `You said: “${sizing.evidence}”`
            : "Size the impact out loud: addressable volume × improvement × margin."}
        </p>
        {card.reference_value_sizing && sizing.status !== "complete" && (
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            Reference: {card.reference_value_sizing}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SignalPill label="Clarifying questions" count={signals.clarifying_questions.count} target={2} />
        <SignalPill label="Check-ins" count={signals.check_ins.count} target={2} />
        <SignalPill label="Summaries" count={signals.summaries.count} target={1} />
        <SignalPill label="Assumptions stated" count={signals.assumptions.count} target={1} />
      </div>

      {(card.flags.length > 0 || card.structure_feedback.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {card.flags.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-amber-300">Flags</h4>
              <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
                {card.flags.map((flag, i) => (
                  <li key={i}>{flag}</li>
                ))}
              </ul>
            </div>
          )}
          {card.structure_feedback.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Structure habits</h4>
              <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
                {card.structure_feedback.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {card.delivery && card.delivery.feedback.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Delivery</h4>
          <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
            {card.delivery.feedback.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {card.trap && <p className="text-xs text-[var(--muted)]">Classic trap in this case: {card.trap}</p>}
    </div>
  );
}
