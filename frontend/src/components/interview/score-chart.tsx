"use client";

import type { InterviewProgress } from "@/lib/types";
import { interviewFocusLabel, curriculumTopicLabel } from "@/lib/types";
import { cn, scoreColor } from "./utils";

export function ScoreTimelineChart({
  points,
}: {
  points: InterviewProgress["score_over_time"];
}) {
  if (points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--panel-2)]/40 px-6 py-10 text-center">
        <p className="text-sm font-medium text-[var(--text-secondary)]">No scores yet</p>
        <p className="mt-1 max-w-xs text-xs text-[var(--muted)]">
          Complete a session to start tracking your improvement over time.
        </p>
      </div>
    );
  }

  const maxScore = 10;
  const chartH = 128;
  const barW = Math.max(28, Math.min(56, Math.floor(640 / points.length)));

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="relative flex items-end gap-2 px-1"
        style={{ minHeight: chartH + 40 }}
        role="img"
        aria-label={`Score history across ${points.length} sessions`}
      >
        <div
          className="pointer-events-none absolute inset-x-0 bottom-8 border-t border-dashed border-[var(--border)]"
          style={{ top: 16 }}
          aria-hidden
        />
        {[8, 6, 4].map((tick) => (
          <div
            key={tick}
            className="pointer-events-none absolute left-0 text-[9px] tabular-nums text-[var(--muted-2)]"
            style={{ bottom: 8 + (tick / maxScore) * chartH + 4 }}
            aria-hidden
          >
            {tick}
          </div>
        ))}
        {points.map((p, i) => {
          const h = Math.max(12, (p.score / maxScore) * chartH);
          const color = scoreColor(p.score);
          return (
            <div
              key={p.session_id}
              className="group flex flex-col items-center gap-1.5 motion-reduce:animate-none animate-fade-up"
              style={{ width: barW, animationDelay: `${i * 40}ms` }}
            >
              <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
                {p.score}
              </span>
              <div
                className="relative w-full overflow-hidden rounded-t-[var(--radius-sm)] transition-[height] duration-500 motion-reduce:transition-none"
                style={{
                  height: h,
                  background: `linear-gradient(to top, ${color}, color-mix(in srgb, ${color} 60%, var(--primary-2)))`,
                }}
                title={`${p.date}: ${p.score}/10 (${interviewFocusLabel(p.focus)})`}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-white/20" aria-hidden />
              </div>
              <span className="max-w-full truncate text-[9px] text-[var(--muted)]">
                {p.date.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HorizontalScoreBar({
  label,
  score,
  max = 10,
  highlight,
}: {
  label: string;
  score: number;
  max?: number;
  highlight?: "weak" | "strong";
}) {
  const pct = Math.min(100, (score / max) * 100);
  const color = scoreColor(score);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span
          className={cn(
            "min-w-0 truncate font-medium",
            highlight === "weak" && "text-amber-300",
            highlight === "strong" && "text-emerald-300"
          )}
        >
          {label}
        </span>
        <span className="shrink-0 font-semibold tabular-nums" style={{ color }}>
          {score}/{max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--panel-3)]">
        <div
          className="h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function ThemeChipList({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: Array<{ text: string; count: number }>;
  tone?: "default" | "green";
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.text}
            className={cn(
              "flex items-start justify-between gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-xs leading-relaxed",
              tone === "green"
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100"
                : "border-[var(--border)] bg-[var(--panel-2)]/50 text-[var(--text-secondary)]"
            )}
          >
            <span>{item.text}</span>
            {item.count > 1 && (
              <span className="shrink-0 rounded-full bg-[var(--panel-3)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--muted)]">
                ×{item.count}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function focusLabel(id: string): string {
  return interviewFocusLabel(id);
}

export { curriculumTopicLabel };
