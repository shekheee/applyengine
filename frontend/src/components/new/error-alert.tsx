"use client";

export function ErrorAlert({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="animate-fade-up mb-6 flex items-start gap-3 rounded-[var(--radius-lg)] border border-red-500/30 bg-red-500/8 px-4 py-3"
    >
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-500/20 text-xs text-red-300"
        aria-hidden
      >
        !
      </span>
      <p className="text-sm leading-relaxed text-red-200">{message}</p>
    </div>
  );
}
