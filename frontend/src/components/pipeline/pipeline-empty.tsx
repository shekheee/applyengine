import { Button } from "@/components/ui";

const STEPS = [
  { step: "1", title: "Paste a job description", desc: "Import any role you're considering" },
  { step: "2", title: "Get fit score & materials", desc: "Tailored resume and cover letter" },
  { step: "3", title: "Track through pipeline", desc: "Move roles as you progress" },
];

export function PipelineEmpty() {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--panel)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, color-mix(in srgb, var(--primary) 20%, transparent), transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative flex flex-col items-center px-6 py-16 text-center sm:py-20">
        <div
          className="mb-6 grid h-14 w-14 place-items-center rounded-2xl border shadow-[0_8px_32px_-8px_var(--glow-soft)]"
          style={{
            borderColor: "var(--border-strong)",
            background: "var(--gradient-surface)",
          }}
          aria-hidden
        >
          <PipelineIcon />
        </div>

        <h2 className="text-xl font-semibold tracking-tight text-[var(--text)]">
          Start your pipeline
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
          Paste a job description to get a fit score, tailored materials, and a dedicated
          workspace for each role.
        </p>

        <div className="mt-10 grid w-full max-w-lg gap-3 text-left sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.step}
              className="rounded-[var(--radius-md)] border bg-[var(--panel-2)]/80 p-4"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--primary) 20%, transparent)",
                  color: "var(--primary-2)",
                }}
              >
                {s.step}
              </span>
              <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted-2)]">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <Button href="/new" variant="gradient" size="lg">
            Create your first application
          </Button>
        </div>
      </div>
    </div>
  );
}

function PipelineIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect x="3" y="5" width="5" height="18" rx="1.5" fill="var(--muted-2)" opacity="0.5" />
      <rect x="11.5" y="5" width="5" height="12" rx="1.5" fill="var(--primary)" opacity="0.8" />
      <rect x="20" y="5" width="5" height="8" rx="1.5" fill="var(--accent-teal)" opacity="0.7" />
    </svg>
  );
}
