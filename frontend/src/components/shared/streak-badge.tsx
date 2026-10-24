/** Current and best streak, in days. */
export function StreakBadge({ current, best }: { current: number; best: number }) {
  return (
    <div
      className="inline-flex items-center gap-3 rounded-[var(--radius-md)] border bg-[var(--panel-2)] px-3 py-2"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
          Streak
        </p>
        <p className="text-lg font-semibold tabular-nums text-[var(--text)]">
          {current} {current === 1 ? "day" : "days"}
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
