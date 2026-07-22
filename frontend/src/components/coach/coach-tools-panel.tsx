"use client";

import type { Memory } from "@/lib/types";
import { Badge, Button } from "@/components/ui";
import { ResumeCoachLink } from "@/components/resume-workspace";

export function CoachToolsPanel({
  memories,
  onRemoveMemory,
  applyState,
  onUpdateResume,
}: {
  memories: Memory[];
  onRemoveMemory: (id: number) => void;
  applyState: "idle" | "working" | "done";
  onUpdateResume: () => void;
}) {
  return (
    <aside className="coach-tools flex h-full flex-col gap-4 p-4" aria-label="Coach tools">
      <ResumeCoachLink />

      <section
        className="rounded-xl border"
        style={{
          borderColor: "var(--border-strong)",
          background: "var(--panel-2)",
          boxShadow: "inset 0 1px 0 color-mix(in srgb, white 3%, transparent)",
        }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">What I&apos;ve learned</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">Facts the coach remembers about you.</p>
          </div>
          <Badge tone="primary">{memories.length}</Badge>
        </div>

        <div className="max-h-52 space-y-2 overflow-y-auto p-3">
          {memories.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-[var(--muted)]" style={{ borderColor: "var(--border)" }}>
              Nothing yet — start chatting.
            </p>
          )}
          {memories.map((m) => (
            <div
              key={m.id}
              className="group flex items-start justify-between gap-2 rounded-lg border px-3 py-2 transition-colors hover:border-[color-mix(in_srgb,var(--primary)_30%,var(--border))]"
              style={{
                borderColor: "var(--border)",
                background: "var(--panel)",
              }}
            >
              <div className="min-w-0">
                <Badge tone="primary">{m.kind}</Badge>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {m.content}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveMemory(m.id)}
                aria-label="Remove memory"
                className="shrink-0 rounded p-1 text-[var(--muted)] opacity-0 transition-opacity hover:text-[var(--red)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 group-hover:opacity-100"
                style={{ outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      <section
        className="rounded-xl border p-4"
        style={{
          borderColor: "var(--border-strong)",
          background: "var(--panel-2)",
          boxShadow: "inset 0 1px 0 color-mix(in srgb, white 3%, transparent)",
        }}
      >
        <h2 className="text-sm font-semibold text-[var(--text)]">Update my resume</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          Fold learned facts into your profile.
        </p>
        <Button
          onClick={onUpdateResume}
          disabled={applyState === "working"}
          className="mt-3 w-full"
          variant="outline"
        >
          {applyState === "working"
            ? "Updating…"
            : applyState === "done"
              ? "✓ Resume updated"
              : "Update my resume"}
        </Button>
      </section>
    </aside>
  );
}
