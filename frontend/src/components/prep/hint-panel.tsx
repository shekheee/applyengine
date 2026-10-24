"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { ChatMarkdown } from "@/components/chat-markdown";
import { Button, Card } from "@/components/ui";

const TIER_LABELS = ["Nudge", "Approach", "Near-solution"];

/**
 * Tiered hints, opened one at a time, with the full solution as the last tier.
 * The server records each reveal, so any of them marks the day's attempt
 * "hint used" and schedules redos.
 */
export function HintPanel({
  taskId,
  date,
  total,
  initial,
  initialSolution,
  waitMinutes,
  onReveal,
}: {
  taskId: string;
  date: string;
  total: number;
  initial: string[];
  initialSolution?: string | null;
  waitMinutes?: number;
  onReveal: (revealed: string[], solution: string | null) => void;
}) {
  const [revealed, setRevealed] = useState<string[]>(initial);
  const [solution, setSolution] = useState<string | null>(initialSolution ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (total === 0) return null;
  const opened = revealed.length + (solution ? 1 : 0);
  const next = opened + 1;
  const done = opened >= total;
  const nextIsSolution = !done && next === total && total > TIER_LABELS.length;

  const reveal = () => {
    const warning = nextIsSolution
      ? "This shows the complete solution, code included. It still counts as a hint and the problem comes back for redos.\n\nShow the solution?"
      : opened === 0
        ? `Opening a hint marks this attempt "hint used" and brings the task back in 3 and 7 days.` +
          (waitMinutes ? ` The plan says struggle ${waitMinutes} minutes first.` : "") +
          `\n\nOpen hint 1?`
        : `Open hint ${next}?`;
    if (!window.confirm(warning)) return;
    setBusy(true);
    setError(null);
    api
      .revealPrepHint(taskId, date)
      .then((res) => {
        setRevealed(res.revealed);
        setSolution(res.solution);
        onReveal(res.revealed, res.solution);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">Hints</h2>
        <span className="text-xs tabular-nums text-[var(--muted)]">
          {opened} of {total} opened
        </span>
      </div>
      {opened === 0 && (
        <p className="text-sm text-[var(--muted)]">
          Stuck? Hints open one at a time, from a gentle nudge to the full solution. Any hint
          counts as a hint used.
        </p>
      )}
      <ol className="space-y-2">
        {revealed.map((hint, index) => (
          <li
            key={index}
            className="rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/10 px-3 py-2"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              Hint {index + 1} · {TIER_LABELS[index] ?? "Hint"}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{hint}</p>
          </li>
        ))}
        {solution && (
          <li className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/5 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-300">
              Hint {revealed.length + 1} · Solution
            </p>
            <div className="mt-1">
              <ChatMarkdown content={solution} density="compact" />
            </div>
          </li>
        )}
      </ol>
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
      {!done && (
        <Button size="sm" variant="outline" onClick={reveal} disabled={busy}>
          {busy
            ? "Opening…"
            : nextIsSolution
              ? `Show hint ${next} (Solution)`
              : `Show hint ${next} (${TIER_LABELS[next - 1] ?? "hint"})`}
        </Button>
      )}
    </Card>
  );
}
