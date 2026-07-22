"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  STATUSES,
  STATUS_LABELS,
  type Application,
  type Job,
  type Status,
} from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageSkeleton,
  Select,
  StatCard,
  cn,
} from "@/components/ui";

const STATUS_TONE: Record<Status, "default" | "green" | "amber" | "red" | "primary"> = {
  saved: "default",
  applied: "primary",
  interview: "amber",
  offer: "green",
  rejected: "red",
};

const COL_CLASS: Record<Status, string> = {
  saved: "kanban-col-saved",
  applied: "kanban-col-applied",
  interview: "kanban-col-interview",
  offer: "kanban-col-offer",
  rejected: "kanban-col-rejected",
};

function fitTone(score: number | null) {
  if (score === null) return "default" as const;
  if (score >= 70) return "green" as const;
  if (score >= 45) return "amber" as const;
  return "red" as const;
}

export default function PipelinePage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Record<number, Job>>({});
  const [provider, setProvider] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [a, j, h] = await Promise.all([
        api.listApplications(),
        api.listJobs(),
        api.health().catch(() => ({ llm_provider: "?" })),
      ]);
      setApps(a);
      setJobs(Object.fromEntries(j.map((x) => [x.id, x])));
      setProvider((h as { llm_provider: string }).llm_provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function move(id: number, status: Status) {
    const updated = await api.setStatus(id, status);
    setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
  }

  const scored = apps.filter((a) => a.fit_score !== null);
  const avgFit =
    scored.length > 0
      ? Math.round(scored.reduce((s, a) => s + (a.fit_score || 0), 0) / scored.length)
      : 0;

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Application pipeline"
        description="Track every role from saved to offer — open any card for chat, resume, and interview prep."
        badge={<Badge tone="primary">LLM · {provider}</Badge>}
        action={
          <Button href="/new" variant="gradient">
            + New application
          </Button>
        }
      />

      {error && (
        <Card className="border-red-500/30 !bg-red-500/5">
          <p className="text-sm text-red-300">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard label="Applications" value={String(apps.length)} accent="primary" />
        <StatCard
          label="Avg. fit"
          value={scored.length ? `${avgFit}` : "–"}
          hint={scored.length ? "across scored roles" : undefined}
          accent="green"
        />
        <StatCard
          label="Interviews"
          value={String(apps.filter((a) => a.status === "interview").length)}
          accent="amber"
        />
        <StatCard
          label="Offers"
          value={String(apps.filter((a) => a.status === "offer").length)}
          accent="green"
        />
      </div>

      {apps.length === 0 ? (
        <Card glass>
          <EmptyState
            title="No applications yet"
            description="Paste a job description to get a fit score, tailored materials, and a dedicated workspace for each role."
            action={<Button href="/new" variant="gradient">Create your first application</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {STATUSES.map((status) => {
            const col = apps.filter((a) => a.status === status);
            return (
              <div key={status} className={cn("space-y-3", COL_CLASS[status])}>
                <div className="flex items-center gap-2 px-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: "var(--col-accent)" }}
                  />
                  <span className="text-sm font-semibold">{STATUS_LABELS[status]}</span>
                  <Badge tone={STATUS_TONE[status]}>{col.length}</Badge>
                </div>
                <div className="space-y-2.5">
                  {col.map((a) => {
                    const job = jobs[a.job_id];
                    return (
                      <div
                        key={a.id}
                        className="card-interactive rounded-[var(--radius-lg)] border bg-[var(--panel)]/90 p-3.5 backdrop-blur-sm"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <Link href={`/applications/${a.id}`} className="block">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold leading-snug">
                              {job?.title || "Role"}
                            </span>
                            <Badge tone={fitTone(a.fit_score)}>{a.fit_score ?? "–"}</Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {job?.company || "—"}
                          </p>
                        </Link>
                        <Select
                          value={a.status}
                          onChange={(e) => move(a.id, e.target.value as Status)}
                          className="mt-2.5 !py-1.5 text-xs"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    );
                  })}
                  {col.length === 0 && (
                    <div
                      className="rounded-[var(--radius-lg)] border border-dashed p-5 text-center text-xs text-[var(--muted-2)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Drop roles here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
