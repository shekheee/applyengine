export function LoginErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="login-rise flex items-start gap-3 rounded-[var(--radius-md)] border border-red-500/35 bg-red-500/[0.08] px-4 py-3"
    >
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-300"
        aria-hidden
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 2.5v3.25M6 8.25h.01"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <p className="text-sm leading-relaxed text-red-200">{message}</p>
    </div>
  );
}
