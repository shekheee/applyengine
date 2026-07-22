import { Badge, Button } from "@/components/ui";

type PipelineHeaderProps = {
  provider: string;
  totalCount: number;
};

export function PipelineHeader({ provider, totalCount }: PipelineHeaderProps) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Pipeline
          </span>
          <span className="h-1 w-1 rounded-full bg-[var(--muted-2)]" aria-hidden />
          <Badge tone="primary">LLM · {provider}</Badge>
        </div>
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-[var(--text)] sm:text-[2rem]">
            Application pipeline
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            {totalCount > 0
              ? `${totalCount} role${totalCount === 1 ? "" : "s"} tracked — open any card for chat, resume tailoring, and interview prep.`
              : "Track every role from saved to offer — open any card for chat, resume, and interview prep."}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button href="/new" variant="gradient" size="md">
          <PlusIcon />
          New application
        </Button>
      </div>
    </header>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3.5v9M3.5 8h9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
