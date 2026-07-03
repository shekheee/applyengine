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
import { Badge, Button, Card, cn } from "@/components/ui";

const STATUS_TONE: Record<Status, "default" | "green" | "amber" | "red" | "primary"> = {
  saved: "default",
  applied: "primary",
  interview: "amber",
  offer: "green",
  rejected: "red",
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

  if (loading) return <p className="text-[var(--muted)]">Loading pipeline…</p>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Application pipeline</h1>
          <p className="text-sm text-[var(--muted)]">
            Track every role, from saved to offer.
          </p>
        </div>
        <Badge tone="primary">LLM: {provider}</Badge>
      </div>

      {error && (
        <Card className="border-red-500/40">
          <p className="text-sm text-red-300">{error}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Start the backend: <code>uvicorn app.main:app --reload</code> in{" "}
            <code>backend/</code>.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Applications" value={String(apps.length)} />
        <Stat label="Avg. fit score" value={scored.length ? `${avgFit}` : "–"} />
        <Stat
          label="Interviews"
          value={String(apps.filter((a) => a.status === "interview").length)}
        />
        <Stat
          label="Offers"
          value={String(apps.filter((a) => a.status === "offer").length)}
        />
      </div>

      {apps.length === 0 ? (
        <Card className="text-center">
          <p className="text-[var(--muted)]">No applications yet.</p>
          <div className="mt-4 flex justify-center">
            <Button href="/new">Create your first application</Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {STATUSES.map((status) => {
            const col = apps.filter((a) => a.status === status);
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm font-medium">{STATUS_LABELS[status]}</span>
                  <Badge tone={STATUS_TONE[status]}>{col.length}</Badge>
                </div>
                <div className="space-y-3">
                  {col.map((a) => {
                    const job = jobs[a.job_id];
                    return (
                      <div
                        key={a.id}
                        className="rounded-lg border bg-[var(--panel)] p-3 transition-colors hover:border-[var(--primary)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <Link href={`/applications/${a.id}`} className="block">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium leading-tight">
                              {job?.title || "Role"}
                            </span>
                            <Badge tone={fitTone(a.fit_score)}>
                              {a.fit_score ?? "–"}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {job?.company || "—"}
                          </p>
                        </Link>
                        <select
                          value={a.status}
                          onChange={(e) => move(a.id, e.target.value as Status)}
                          className="mt-2 w-full rounded-md border bg-[var(--panel-2)] px-2 py-1 text-xs text-[var(--muted)] outline-none"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                  {col.length === 0 && (
                    <div
                      className={cn(
                        "rounded-lg border border-dashed p-4 text-center text-xs text-[var(--muted)]"
                      )}
                      style={{ borderColor: "var(--border)" }}
                    >
                      empty
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}
