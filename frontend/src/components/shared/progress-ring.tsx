/** Circular percentage meter. `value` is 0-100. */
export function ProgressRing({
  value,
  label,
  size = 88,
}: {
  value: number;
  label: string;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const tone = pct >= 100 ? "var(--green)" : "var(--primary-2)";
  const inner = size - 16;
  return (
    <div
      role="img"
      aria-label={`${label}: ${pct}%`}
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${tone} ${pct * 3.6}deg, var(--panel-3) 0deg)`,
      }}
    >
      <div
        className="flex flex-col items-center justify-center rounded-full bg-[var(--panel)] ring-1 ring-[var(--border)]"
        style={{ width: inner, height: inner }}
      >
        <span className="text-lg font-semibold tabular-nums" style={{ color: tone }}>
          {pct}%
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
          {label}
        </span>
      </div>
    </div>
  );
}
