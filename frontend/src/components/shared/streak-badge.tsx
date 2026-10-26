/** Current and best streak, in days. */
export function StreakBadge({
  current,
  best,
  paused = false,
}: {
  current: number;
  best: number;
  paused?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center gap-3 rounded-[var(--radius-md)] border bg-[var(--panel-2)] px-3 py-2"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
          Streak
        </p>
        <p className="flex items-baseline gap-1.5 text-lg font-semibold tabular-nums text-[var(--text)]">
          {current} {current === 1 ? "day" : "days"}
          {paused && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
              Paused
            </span>
          )}
        </p>
      </div>
      <div className="h-8 w-px bg-[var(--border)]" />
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
          Best
        </p>
        <p className="text-lg font-semibold tabular-nums text-[var(--muted)]">{best}</p>
      </div>
    </div>
  );
}
