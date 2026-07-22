import type { Application, Status } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { cn } from "@/components/ui";
import { STATUS_CONFIG, fitTone } from "./constants";

type PipelineMetricsProps = {
  apps: Application[];
};

export function PipelineMetrics({ apps }: PipelineMetricsProps) {
  const scored = apps.filter((a) => a.fit_score !== null);
  const avgFit =
    scored.length > 0
      ? Math.round(scored.reduce((s, a) => s + (a.fit_score || 0), 0) / scored.length)
      : null;
  const interviews = apps.filter((a) => a.status === "interview").length;
  const offers = apps.filter((a) => a.status === "offer").length;
  const active = apps.filter((a) => a.status !== "rejected").length;
  const conversion =
    active > 0 ? Math.round((offers / active) * 100) : null;

  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, apps.filter((a) => a.status === s).length])
  ) as Record<Status, number>;

  const metrics = [
    {
      label: "Total roles",
      value: String(apps.length),
      sub: active !== apps.length ? `${active} active` : undefined,
      accent: "var(--primary)",
    },
    {
      label: "Avg. fit score",
      value: avgFit !== null ? String(avgFit) : "—",
      sub: scored.length ? `${scored.length} scored` : "none scored yet",
      accent: avgFit !== null ? `var(--${fitTone(avgFit) === "green" ? "green" : fitTone(avgFit) === "amber" ? "amber" : "red"})` : "var(--muted)",
    },
    {
      label: "In interview",
      value: String(interviews),
      sub: interviews === 1 ? "active stage" : "active stages",
      accent: "var(--amber)",
    },
    {
      label: "Offers",
      value: String(offers),
      sub: conversion !== null && offers > 0 ? `${conversion}% of active` : "none yet",
      accent: "var(--green)",
    },
  ];

  return (
    <section aria-label="Pipeline metrics" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="group relative overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--panel)] p-4 motion-safe:transition-[border-color,box-shadow] motion-safe:duration-200 hover:border-[var(--border-strong)] focus-within:ring-2 focus-within:ring-[var(--primary)]/30"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-80"
              style={{ background: `linear-gradient(90deg, transparent, ${m.accent}, transparent)` }}
            />
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              {m.label}
            </p>
            <p className="mt-2 text-[1.75rem] font-semibold tabular-nums leading-none tracking-tight text-[var(--text)]">
              {m.value}
            </p>
            {m.sub && (
              <p className="mt-1.5 text-xs text-[var(--muted-2)]">{m.sub}</p>
            )}
          </div>
        ))}
      </div>

      {apps.length > 0 && (
        <div
          className="rounded-[var(--radius-lg)] border bg-[var(--panel)] px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--muted)]">Status distribution</span>
            <span className="text-xs tabular-nums text-[var(--muted-2)]">{apps.length} total</span>
          </div>
          <div
            className="flex h-2 overflow-hidden rounded-full bg-[var(--panel-2)]"
            role="img"
            aria-label={`Pipeline distribution: ${STATUSES.map((s) => `${STATUS_CONFIG[s].label} ${counts[s]}`).join(", ")}`}
          >
            {STATUSES.map((status) => {
              const count = counts[status];
              if (count === 0) return null;
              const pct = (count / apps.length) * 100;
              return (
                <div
                  key={status}
                  className="h-full motion-safe:transition-[width] motion-safe:duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: STATUS_CONFIG[status].accent,
                    minWidth: count > 0 ? "4px" : undefined,
                  }}
                  title={`${STATUS_CONFIG[status].label}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {STATUSES.map((status) => (
              <div key={status} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_CONFIG[status].accent }}
                  aria-hidden
                />
                <span>{STATUS_CONFIG[status].label}</span>
                <span className="tabular-nums text-[var(--muted-2)]">{counts[status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
