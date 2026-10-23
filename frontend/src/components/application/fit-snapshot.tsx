"use client";

import { ChatMarkdown } from "@/components/chat-markdown";
import { Badge, Button, cn, ScoreRing } from "@/components/ui";
import { CollapsibleContent } from "@/components/collapsible-content";
import type { Application } from "@/lib/types";

function formatCheckedAt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MetricBar({
  label,
  value,
  tone = "primary",
}: {
  label: string;
  value: number;
  tone?: "primary" | "green" | "amber" | "red";
}) {
  const fill =
    tone === "green"
      ? "from-emerald-500 to-emerald-400"
      : tone === "amber"
        ? "from-amber-500 to-amber-400"
        : tone === "red"
          ? "from-red-500 to-red-400"
          : "from-[var(--primary)] to-[var(--primary-2)]";

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
        <span className="text-sm font-semibold tabular-nums tracking-tight">{value}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-[var(--panel-3)]"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r transition-[width] duration-500 motion-reduce:transition-none",
            fill
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function KeywordColumn({
  title,
  count,
  keywords,
  tone,
  emptyLabel,
}: {
  title: string;
  count: number;
  keywords: string[];
  tone: "green" | "amber";
  emptyLabel: string;
}) {
  const titleColor = tone === "green" ? "text-emerald-400" : "text-amber-400";

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className={cn("text-xs font-semibold uppercase tracking-wider", titleColor)}>
          {title}
        </h3>
        <span
          className="rounded-md bg-[var(--panel-3)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--muted)]"
          aria-label={`${count} ${title.toLowerCase()}`}
        >
          {count}
        </span>
      </div>
      <div className="flex max-h-36 flex-wrap content-start gap-1.5 overflow-y-auto overscroll-contain sm:max-h-40">
        {keywords.length ? (
          keywords.map((k) => (
            <Badge key={k} tone={tone}>
              <span className="break-words">{k}</span>
            </Badge>
          ))
        ) : (
          <span className="text-xs text-[var(--muted-2)]">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

export function FitSnapshot({
  app,
  onAnalyze,
  analyzing = false,
  analyzeError,
}: {
  app: Application;
  onAnalyze?: () => void;
  analyzing?: boolean;
  analyzeError?: string;
}) {
  const matched = app.matched_keywords ?? [];
  const missing = app.missing_keywords ?? [];
  const coverage = Math.round((app.keyword_coverage ?? 0) * 100);
  const fitScore = app.fit_score ?? 0;
  const fitTone =
    fitScore >= 70 ? "green" : fitScore >= 45 ? "amber" : fitScore > 0 ? "red" : "primary";
  const hasScore = app.fit_score !== null;
  const breakdown = app.fit_breakdown?.version ? app.fit_breakdown : undefined;
  const components = Object.values(breakdown?.components ?? {}).filter(
    (component) => component.available && component.score !== null
  );
  const requirements = breakdown?.requirements ?? [];
  const requirementCounts = requirements.reduce(
    (counts, requirement) => {
      counts[requirement.status] += 1;
      return counts;
    },
    { met: 0, partial: 0, gap: 0 }
  );

  return (
    <section aria-labelledby="fit-snapshot-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="fit-snapshot-heading"
            className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]"
          >
            Fit snapshot
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-2)]">
            How your profile aligns with this role
          </p>
          {breakdown && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="primary">Fit Score v{breakdown.version}</Badge>
              <span className="text-xs capitalize text-[var(--muted-2)]">
                {breakdown.confidence} confidence
              </span>
            </div>
          )}
          {hasScore && !breakdown && (
            <div className="mt-2">
              <Badge tone="amber">Legacy score · re-check for Fit Score v2</Badge>
            </div>
          )}
          {hasScore && app.updated_at && (
            <p className="mt-1 text-xs text-[var(--muted-2)]">
              Last checked {formatCheckedAt(app.updated_at)}
            </p>
          )}
        </div>
        {onAnalyze && (
          <div className="flex flex-col items-end gap-2">
            <Button onClick={onAnalyze} disabled={analyzing} size="sm" variant="outline">
              {analyzing ? "Analyzing fit…" : hasScore ? "Re-check fit" : "Check fit"}
            </Button>
            {analyzeError && (
              <p className="max-w-xs text-right text-xs text-[var(--red)]" role="alert">
                {analyzeError}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        {/* Score card */}
        <div
          className={cn(
            "lg:col-span-4 rounded-[var(--radius-lg)] border bg-[var(--panel)] p-6",
            "shadow-[var(--shadow-sm),inset_0_1px_0_rgba(255,255,255,0.04)]"
          )}
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-5">
            <ScoreRing score={app.fit_score} />
            <div className="min-w-0 flex-1">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
                  Overall fit
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted-2)]">
                  {app.fit_score === null
                    ? "Score pending analysis"
                    : fitScore >= 70
                      ? "Strong alignment with role requirements"
                      : fitScore >= 45
                        ? "Moderate fit — review gaps below"
                        : "Significant gaps to address"}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 space-y-4 border-t pt-5" style={{ borderColor: "var(--border)" }}>
            {components.length ? (
              components.map((component) => (
                <div key={component.label} title={component.explanation}>
                  <MetricBar
                    label={`${component.label} · ${Math.round(component.weight)}% weight`}
                    value={Math.round(component.score ?? 0)}
                    tone={fitTone}
                  />
                </div>
              ))
            ) : (
              <MetricBar label="Keyword coverage" value={coverage} tone={fitTone} />
            )}
          </div>
        </div>

        {/* Keywords + analysis */}
        <div
          className={cn(
            "lg:col-span-8 min-w-0 rounded-[var(--radius-lg)] border bg-[var(--panel)] p-6",
            "shadow-[var(--shadow-sm),inset_0_1px_0_rgba(255,255,255,0.04)]"
          )}
          style={{ borderColor: "var(--border)" }}
        >
          <div className="grid min-w-0 gap-6 sm:grid-cols-2">
            <KeywordColumn
              title="Matched"
              count={matched.length}
              keywords={matched}
              tone="green"
              emptyLabel="No matches yet"
            />
            <KeywordColumn
              title="Gaps"
              count={missing.length}
              keywords={missing}
              tone="amber"
              emptyLabel="No gaps flagged"
            />
          </div>

          {requirements.length > 0 && (
            <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Requirement evidence
                </h3>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-emerald-400">{requirementCounts.met} met</span>
                  <span className="text-amber-400">{requirementCounts.partial} partial</span>
                  <span className="text-red-400">{requirementCounts.gap} gaps</span>
                </div>
              </div>
              <details className="group mt-3">
                <summary className="cursor-pointer select-none text-sm font-medium text-[var(--primary-2)] outline-none hover:underline">
                  Review how each requirement was scored
                </summary>
                <div className="mt-3 divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-2)]/50 px-4">
                  {requirements.map((requirement, index) => (
                    <div key={`${requirement.text}-${index}`} className="py-3">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <p className="min-w-0 text-sm leading-snug text-[var(--text)]">
                          {requirement.text}
                        </p>
                        <Badge
                          tone={
                            requirement.status === "met"
                              ? "green"
                              : requirement.status === "partial"
                                ? "amber"
                                : "red"
                          }
                        >
                          {Math.round(requirement.score)}%
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs capitalize text-[var(--muted-2)]">
                        {requirement.priority}
                        {requirement.missing_terms.length
                          ? ` · Missing: ${requirement.missing_terms.join(", ")}`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {app.gap_analysis?.trim() && (
            <div
              className="mt-6 min-w-0 border-t pt-6"
              style={{ borderColor: "var(--border)" }}
            >
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Gap analysis
              </h3>
              <div
                className="min-w-0 rounded-[var(--radius-md)] border bg-[var(--panel-2)]/60 px-4 py-3"
                style={{ borderColor: "var(--border)" }}
              >
                <CollapsibleContent variant="assistant" className="min-w-0">
                  <ChatMarkdown content={app.gap_analysis.trim()} density="compact" />
                </CollapsibleContent>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
