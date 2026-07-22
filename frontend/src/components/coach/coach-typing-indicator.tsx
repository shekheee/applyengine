"use client";

export function CoachTypingIndicator() {
  return (
    <div
      className="coach-typing flex items-center gap-3"
      role="status"
      aria-live="polite"
      aria-label="Coach is typing"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
        style={{
          background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dim) 100%)",
          boxShadow: "0 0 0 1px color-mix(in srgb, var(--primary) 40%, transparent)",
        }}
      >
        <span className="text-xs font-semibold">C</span>
      </div>
      <div
        className="rounded-2xl rounded-tl-md border px-4 py-3"
        style={{
          borderColor: "var(--border-strong)",
          background: "var(--panel-2)",
          boxShadow: "inset 0 1px 0 color-mix(in srgb, white 4%, transparent)",
        }}
      >
        <span className="coach-typing-dots inline-flex items-center gap-1">
          <span className="coach-typing-dot" />
          <span className="coach-typing-dot" style={{ animationDelay: "120ms" }} />
          <span className="coach-typing-dot" style={{ animationDelay: "240ms" }} />
        </span>
      </div>
    </div>
  );
}
