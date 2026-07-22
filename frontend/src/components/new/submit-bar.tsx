"use client";

import { Button, cn } from "@/components/ui";

type Requirement = {
  id: string;
  label: string;
  met: boolean;
};

function ChecklistItem({ label, met }: { label: string; met: boolean }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px]",
          met
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
            : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted-2)]"
        )}
        aria-hidden
      >
        {met ? "✓" : ""}
      </span>
      <span className={met ? "text-[var(--text-secondary)]" : "text-[var(--muted)]"}>
        {label}
      </span>
    </li>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z"
      />
    </svg>
  );
}

export function SubmitBar({
  requirements,
  busy,
  onSubmit,
  canSubmit,
}: {
  requirements: Requirement[];
  busy: boolean;
  onSubmit: () => void;
  canSubmit: boolean;
}) {
  const metCount = requirements.filter((r) => r.met).length;

  return (
    <div
      className="animate-fade-up sticky bottom-0 z-10 -mx-4 mt-8 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mt-10 lg:rounded-[var(--radius-xl)] lg:border lg:bg-[var(--panel)] lg:px-5 lg:py-4 lg:shadow-[var(--shadow-sm)]"
      style={{ animationDelay: "180ms" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-2)]">
            Step 3 · Analyze & open
          </p>
          <ul
            className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-1.5"
            aria-label="Requirements to continue"
          >
            {requirements.map((req) => (
              <ChecklistItem key={req.id} label={req.label} met={req.met} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--muted-2)] sm:hidden">
            {metCount} of {requirements.length} complete
          </p>
        </div>

        <Button
          onClick={onSubmit}
          disabled={busy || !canSubmit}
          variant="gradient"
          size="lg"
          className="w-full shrink-0 sm:w-auto sm:min-w-[200px]"
          aria-busy={busy}
        >
          {busy ? (
            <>
              <Spinner />
              Analyzing fit…
            </>
          ) : (
            <>
              Analyze fit
              <span aria-hidden>→</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
