"use client";

import { Badge, cn, ScoreRing } from "@/components/ui";
import { CollapsibleContent } from "@/components/collapsible-content";
import type { Application } from "@/lib/types";

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
  tone: "green" | "red";
  emptyLabel: string;
}) {
  const titleColor = tone === "green" ? "text-emerald-400" : "text-red-400";

  return (
    <div className="flex min-h-0 flex-col">
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
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto overscroll-contain sm:max-h-32">
        {keywords.length ? (
          keywords.map((k) => (
            <Badge key={k} tone={tone === "green" ? "green" : "red"}>
              {k}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-[var(--muted-2)]">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

export function FitSnapshot({ app }: { app: Application }) {
  const coverage = Math.round((app.keyword_coverage ?? 0) * 100);
  const fitScore = app.fit_score ?? 0;
  const fitTone =
    fitScore >= 70 ? "green" : fitScore >= 45 ? "amber" : fitScore > 0 ? "red" : "primary";

  return (
    <section aria-labelledby="fit-snapshot-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
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
        </div>
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
            <div className="min-w-0 flex-1 space-y-4">
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
              <MetricBar label="Keyword coverage" value={coverage} tone={fitTone} />
            </div>
          </div>
        </div>

        {/* Keywords + analysis */}
        <div
          className={cn(
            "lg:col-span-8 rounded-[var(--radius-lg)] border bg-[var(--panel)] p-6",
            "shadow-[var(--shadow-sm),inset_0_1px_0_rgba(255,255,255,0.04)]"
          )}
          style={{ borderColor: "var(--border)" }}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <KeywordColumn
              title="Matched"
              count={app.matched_keywords.length}
              keywords={app.matched_keywords}
              tone="green"
              emptyLabel="No matches yet"
            />
            <KeywordColumn
              title="Gaps"
              count={app.missing_keywords.length}
              keywords={app.missing_keywords}
              tone="red"
              emptyLabel="No gaps flagged"
            />
          </div>

          {app.gap_analysis?.trim() && (
            <div
              className="mt-6 border-t pt-6"
              style={{ borderColor: "var(--border)" }}
            >
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Gap analysis
              </h3>
              <CollapsibleContent variant="assistant">
                <p className="text-sm leading-relaxed text-[var(--text)]/90">
                  {app.gap_analysis}
                </p>
              </CollapsibleContent>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
