"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type {
  PrepCheckpoint,
  PrepCheckpoints,
  PrepInsightGroup,
  PrepInsights,
} from "@/lib/types";
import { Badge, Button, Card, PageHeader, PageSkeleton, StatCard } from "@/components/ui";
import { localISODate, shortDate } from "./dates";
import { PrepNav } from "./prep-nav";

const STATUS: Record<
  PrepCheckpoint["status"],
  { label: string; tone: "default" | "green" | "amber" | "red" | "primary" }
> = {
  upcoming: { label: "Upcoming", tone: "default" },
  open: { label: "Open", tone: "primary" },
  in_progress: { label: "In progress", tone: "amber" },
  attempted: { label: "Not passed yet", tone: "red" },
  passed: { label: "Passed", tone: "green" },
};

function pct(value: number | null | undefined): string {
  return value == null ? "–" : `${Math.round(value * 100)}%`;
}

export function checkpointHref(taskId: string, runId: number): string {
  return `/prep/session/${encodeURIComponent(taskId)}?checkpoint=${runId}`;
}

function CheckpointRow({
  checkpoint,
  onStart,
  starting,
}: {
  checkpoint: PrepCheckpoint;
  onStart: () => void;
  starting: boolean;
}) {
  const status = STATUS[checkpoint.status];
  const last = checkpoint.runs.find((r) => r.finished_at);
  const computed = checkpoint.rule === "computed";
  return (
    <li className="space-y-2 rounded-[var(--radius-md)] border px-4 py-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Week {checkpoint.week}
            </span>
            <h3 className="text-sm font-semibold text-[var(--text)]">{checkpoint.title}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{checkpoint.criteria}</p>
          {computed && <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">{checkpoint.progress}</p>}
        </div>
        {computed ? (
          <Button
            size="sm"
            variant="outline"
            href={checkpoint.id === "cp-stories" ? "/prep/stories" : "/prep/mocks"}
          >
            {checkpoint.id === "cp-stories" ? "Story bank" : "Mock log"}
          </Button>
        ) : checkpoint.status === "passed" ? null : (
          <Button
            size="sm"
            variant={checkpoint.status === "upcoming" ? "ghost" : "primary"}
            onClick={onStart}
            disabled={starting}
          >
            {starting
              ? "Starting…"
              : checkpoint.status === "in_progress"
                ? "Resume"
                : checkpoint.status === "attempted"
                  ? "Try again"
                  : checkpoint.status === "upcoming"
                    ? "Start early"
                    : "Start"}
          </Button>
        )}
      </div>
      {last && (
        <p className={`text-xs ${last.passed ? "text-emerald-300" : "text-[var(--muted)]"}`}>
          Last run {shortDate(last.date)} on {last.task_title ?? last.task_id}:{" "}
          {last.passed ? "passed" : `not passed — ${(last.details.reasons ?? []).join("; ")}`}
        </p>
      )}
    </li>
  );
}

function GroupTable({ title, rows }: { title: string; rows: PrepInsightGroup[] }) {
  if (rows.length === 0) return null;
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              <th className="py-1.5 pr-3 font-medium">Area</th>
              <th className="py-1.5 pr-3 text-right font-medium">Attempts</th>
              <th className="py-1.5 pr-3 text-right font-medium">Solved</th>
              <th className="py-1.5 pr-3 text-right font-medium">Clean</th>
              <th className="py-1.5 pr-3 text-right font-medium">Hints</th>
              <th className="py-1.5 pr-3 text-right font-medium">Time vs target</th>
              <th className="py-1.5 font-medium">Weakness</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 pr-3 text-[var(--text)]">{row.name}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{row.attempts}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{pct(row.solved_rate)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{pct(row.clean_rate)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{pct(row.hint_rate)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{row.time_ratio.toFixed(2)}×</td>
                <td className="py-1.5">
                  <div className="h-1.5 w-24 rounded-full bg-[var(--panel-2)]">
                    <div
                      className="h-1.5 rounded-full bg-red-400/80"
                      style={{ width: `${Math.round(Math.min(row.weakness, 1) * 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Readiness checkpoints, weak spots and the long-term review queue. */
export function PrepProgress() {
  const [date] = useState(localISODate);
  const [checkpoints, setCheckpoints] = useState<PrepCheckpoints | null>(null);
  const [insights, setInsights] = useState<PrepInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    Promise.all([api.getPrepCheckpoints(date), api.getPrepInsights(date)])
      .then(([cp, ins]) => {
        setCheckpoints(cp);
        setInsights(ins);
      })
      .catch((err: Error) => setError(err.message));
  }, [date]);

  const start = (checkpoint: PrepCheckpoint) => {
    if (
      checkpoint.status !== "in_progress" &&
      !window.confirm(
        `${checkpoint.title}\n\n${checkpoint.criteria}\n\nThe timer starts as soon as the workspace opens, and hints and the solution stay locked. Start now?`
      )
    )
      return;
    setStarting(checkpoint.id);
    api
      .startPrepCheckpoint(checkpoint.id, date)
      .then((run) => router.push(checkpointHref(run.task_id ?? "", run.id)))
      .catch((err: Error) => {
        setError(err.message);
        setStarting(null);
      });
  };

  if (!checkpoints && !error) return <PageSkeleton />;
  const totals = insights?.totals;
  const trend =
    totals?.recent_clean_rate != null && totals.earlier_clean_rate != null
      ? totals.recent_clean_rate - totals.earlier_clean_rate
      : null;

  return (
    <div className="page-shell mx-auto max-w-4xl space-y-5 pb-12">
      <PrepNav />
      <PageHeader
        title="Progress"
        description="Pass the checkpoints and you're ready to interview. Weak spots feed back into your daily extras."
      />
      {error && (
        <Card>
          <p className="text-sm text-[var(--red)]">{error}</p>
        </Card>
      )}

      {checkpoints && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {checkpoints.readiness.map((track) => (
              <StatCard
                key={track.track}
                label={track.label}
                value={`${track.passed}/${track.total}`}
                hint={track.ready ? "Ready" : "checkpoints passed"}
                accent={track.ready ? "green" : track.passed > 0 ? "amber" : "default"}
              />
            ))}
          </div>

          <Card className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">Readiness checkpoints</h2>
              <span className="text-xs text-[var(--muted)]">You are in week {checkpoints.week}</span>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Each run is timed and unassisted: no hints, no solution, no tutor until it ends. A failed
              run is fine. Try again on a fresh problem when you&apos;re ready.
            </p>
            <ul className="space-y-2">
              {checkpoints.checkpoints.map((checkpoint) => (
                <CheckpointRow
                  key={checkpoint.id}
                  checkpoint={checkpoint}
                  onStart={() => start(checkpoint)}
                  starting={starting === checkpoint.id}
                />
              ))}
            </ul>
          </Card>
        </>
      )}

      {insights && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Clean solves"
              value={pct(totals?.clean_rate)}
              hint={`${totals?.attempts ?? 0} logged attempts on ${totals?.tasks ?? 0} tasks`}
              accent="primary"
            />
            <StatCard
              label="Last 14 days"
              value={pct(totals?.recent_clean_rate)}
              hint={
                trend == null
                  ? "solved, no hint, within target"
                  : `${trend >= 0 ? "+" : ""}${Math.round(trend * 100)} pts vs before`
              }
              accent={trend != null && trend < 0 ? "amber" : "green"}
            />
            <StatCard
              label="Review due"
              value={String(insights.review_due.length)}
              hint="clean solves from 30+ days ago"
              accent={insights.review_due.length ? "amber" : "default"}
            />
          </div>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">Weakest patterns</h2>
            {insights.weakest.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Nothing stands out yet. A pattern needs two or more logged attempts with a miss, a hint
                or an overrun before it shows here.
              </p>
            ) : (
              <ol className="space-y-2">
                {insights.weakest.map((row, index) => (
                  <li key={row.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium text-[var(--text)]">
                      {index + 1}. {row.name}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      solved {pct(row.solved_rate)} · hints {pct(row.hint_rate)} · over time{" "}
                      {pct(row.overtime_rate)} · {row.attempts} attempts
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {insights.weakest[0] && (
              <p className="text-xs text-[var(--muted)]">
                One of your daily medium extras targets {insights.weakest[0].name} (marked &quot;Weak
                spot&quot; when it isn&apos;t already this week&apos;s pattern).
              </p>
            )}
          </Card>

          <GroupTable title="By pattern (DSA)" rows={insights.by_pattern} />
          <GroupTable title="By area" rows={insights.by_type} />

          {insights.review_due.length > 0 && (
            <Card className="space-y-2">
              <h2 className="text-sm font-semibold text-[var(--text)]">Long-term review queue</h2>
              <p className="text-xs text-[var(--muted)]">
                One a day appears on Today, oldest first. You can also do them now.
              </p>
              <ul className="space-y-1">
                {insights.review_due.map((item) => (
                  <li key={item.task_id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[var(--text-secondary)]">{item.title}</span>
                    <Link
                      href={`/prep/session/${encodeURIComponent(item.task_id)}`}
                      className="text-xs font-medium text-[var(--primary-2)] hover:underline"
                    >
                      Redo
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
