"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PrepPlan, PrepPlanTask, PrepTaskType } from "@/lib/types";
import { Badge, Card, PageHeader, PageSkeleton, TabBar, cn } from "@/components/ui";
import { localISODate, shortDate } from "./dates";
import { PrepNav } from "./prep-nav";

type Filter = "all" | PrepTaskType;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dsa", label: "DSA" },
  { id: "drill", label: "Drills" },
  { id: "python", label: "Python" },
  { id: "lld", label: "LLD" },
  { id: "hld", label: "HLD" },
  { id: "project", label: "Project" },
];

const STATUS: Record<PrepPlanTask["status"], { label: string; tone: "default" | "green" | "amber" }> = {
  todo: { label: "To do", tone: "default" },
  done: { label: "Done", tone: "green" },
  redo: { label: "Redo queued", tone: "amber" },
};

function detail(task: PrepPlanTask): string {
  const parts: string[] = [task.type.toUpperCase()];
  if (task.pattern) parts.push(task.pattern);
  if (task.day) parts.push(task.day);
  parts.push(`${task.target_minutes} min`);
  if (task.last_date) {
    const last = [`last ${shortDate(task.last_date)}`];
    if (task.last_minutes !== null) last.push(`${task.last_minutes} min`);
    if (task.last_hint) last.push("hint");
    if (task.last_solved && task.last_solved !== "yes") last.push(task.last_solved);
    parts.push(last.join(", "));
  }
  if (task.next_redo) parts.push(`redo ${shortDate(task.next_redo)}`);
  return parts.join(" · ");
}

export function PrepPlanView() {
  const [plan, setPlan] = useState<PrepPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api
      .getPrepPlan(localISODate())
      .then(setPlan)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (!plan && !error) return <PageSkeleton />;

  const weeks = (plan?.weeks ?? [])
    .map((week) => ({
      ...week,
      shown: week.tasks.filter((t) => filter === "all" || t.type === filter),
    }))
    .filter((week) => week.shown.length > 0 || (filter === "all" && week.week >= 9));
  const all = plan?.weeks.flatMap((w) => w.tasks) ?? [];
  const matching = all.filter((t) => filter === "all" || t.type === filter);
  const done = matching.filter((t) => t.status !== "todo").length;

  return (
    <div className="page-shell mx-auto max-w-4xl pb-12">
      <PrepNav />
      <PageHeader
        title="Plan"
        description={`${done} of ${matching.length} ${filter === "all" ? "tasks" : FILTERS.find((f) => f.id === filter)?.label} attempted across 10 weeks.`}
      />
      {error && <Card><p className="text-sm text-[var(--red)]">{error}</p></Card>}
      <TabBar tabs={FILTERS} active={filter} onChange={setFilter} className="mb-5" />

      <div className="space-y-4">
        {weeks.map((week) => {
          const current = plan?.current_week === week.week;
          return (
            <Card key={week.week} className={cn(current && "ring-1 ring-[var(--primary)]")}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Week {week.week}
                  {week.start_date && (
                    <span className="ml-2 font-normal text-[var(--muted)]">
                      from {shortDate(week.start_date)}
                    </span>
                  )}
                  {current && <span className="ml-2"><Badge tone="primary">This week</Badge></span>}
                </h2>
                <span className="text-xs tabular-nums text-[var(--muted)]">
                  {week.shown.filter((t) => t.status !== "todo").length}/{week.shown.length}
                </span>
              </div>
              {week.shown.length === 0 ? (
                <p className="py-3 text-sm text-[var(--muted)]">
                  One unseen NeetCode 150 medium each morning, plus redos. Logged problems show up here.
                </p>
              ) : (
                <ul className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
                  {week.shown.map((task) => (
                    <li key={task.task_id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              task.status === "todo" ? "text-[var(--text)]" : "text-[var(--text-secondary)]"
                            )}
                          >
                            {task.title}
                          </span>
                          {task.status !== "todo" && (
                            <Badge tone={STATUS[task.status].tone}>
                              {STATUS[task.status].label}
                              {task.attempts > 1 ? ` · ${task.attempts}×` : ""}
                            </Badge>
                          )}
                          {task.stretch && <Badge>Stretch</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">{detail(task)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {task.url && (
                          <a
                            href={task.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-[var(--primary-2)] hover:underline"
                          >
                            Open ↗
                          </a>
                        )}
                        <Link
                          href={`/prep/session/${encodeURIComponent(task.task_id)}`}
                          className="rounded-[var(--radius-md)] border px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--panel-2)]"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {task.status === "todo" ? "Start" : "Again"}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
