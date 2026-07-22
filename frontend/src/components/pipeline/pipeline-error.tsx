type PipelineErrorProps = {
  message: string;
};

export function PipelineError({ message }: PipelineErrorProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3"
      style={{
        borderColor: "color-mix(in srgb, var(--red) 35%, var(--border))",
        backgroundColor: "color-mix(in srgb, var(--red) 8%, var(--panel))",
      }}
    >
      <span className="mt-0.5 shrink-0 text-red-400" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 5.5v4M9 11.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-medium text-red-200">Unable to load pipeline</p>
        <p className="mt-0.5 text-sm text-red-300/90">{message}</p>
      </div>
    </div>
  );
}
