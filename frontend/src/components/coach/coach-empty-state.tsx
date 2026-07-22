"use client";

import { CoachAvatarIcon } from "@/components/coach/coach-icons";

export function CoachEmptyState({
  embedded,
  hasJd,
  starters,
  onStarter,
  disabled,
}: {
  embedded?: boolean;
  hasJd?: boolean;
  starters: string[];
  onStarter: (text: string) => void;
  disabled?: boolean;
}) {
  const title =
    embedded && hasJd
      ? "Ask anything about this role"
      : "How can I help with your career?";
  const subtitle =
    embedded && hasJd
      ? "This thread is scoped to the job description. Prep, gaps, and talking points stay role-specific."
      : "Ask about resume bullets, interview prep, or attach a PDF or screenshot for feedback.";

  return (
    <div
      className={`coach-empty flex flex-col items-center text-center ${
        embedded ? "py-10" : "py-16"
      }`}
    >
      <div
        className="coach-empty-icon mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{
          background: "linear-gradient(145deg, var(--primary) 0%, var(--primary-dim) 100%)",
          boxShadow: "0 8px 24px -8px var(--glow)",
        }}
      >
        <CoachAvatarIcon className="h-7 w-7" />
      </div>

      <h2 className="text-xl font-semibold tracking-tight text-[var(--text)]">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">{subtitle}</p>

      <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {starters.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => onStarter(s)}
            disabled={disabled}
            className="coach-starter card-interactive rounded-xl border px-4 py-3 text-left text-sm leading-snug text-[var(--text-secondary)] transition-colors hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            style={{
              borderColor: "var(--border-strong)",
              background: "var(--panel-2)",
              outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)",
              animationDelay: `${i * 60}ms`,
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
