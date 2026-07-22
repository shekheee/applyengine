"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Application, Job, Status } from "@/lib/types";
import {
  PipelineBoard,
  PipelineEmpty,
  PipelineError,
  PipelineHeader,
  PipelineMetrics,
  PipelineSkeleton,
} from "@/components/pipeline";

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

  if (loading) return <PipelineSkeleton />;

  return (
    <div className="page-enter mx-auto max-w-[1400px] space-y-8 motion-reduce:animate-none">
      <PipelineHeader provider={provider} totalCount={apps.length} />

      {error && <PipelineError message={error} />}

      <PipelineMetrics apps={apps} />

      {apps.length === 0 ? (
        <PipelineEmpty />
      ) : (
        <PipelineBoard apps={apps} jobs={jobs} onStatusChange={move} />
      )}
    </div>
  );
}
