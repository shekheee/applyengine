import { Button } from "@/components/ui";

type PipelineHeaderProps = {
  provider: string;
  totalCount: number;
};

export function PipelineHeader({ provider, totalCount }: PipelineHeaderProps) {
  return (
    <header className="flex flex-col gap-5 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="eyebrow">Your job search</p>
        <h1 className="page-title mt-1">Applications</h1>
          <p className="page-description mt-2">
            {totalCount > 0
              ? `${totalCount} role${totalCount === 1 ? "" : "s"} tracked from first review to offer.`
              : "Track each role, tailor your material and prepare for interviews in one place."}
          </p>
        <p className="mt-2 text-xs text-[var(--muted-2)]">AI services: {provider || "checking"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button href="/new" variant="primary" size="md">
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
