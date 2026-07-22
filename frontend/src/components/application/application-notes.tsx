"use client";

import { cn } from "@/components/ui";
import { useState } from "react";

export function ApplicationNotes({
  notes,
  onChange,
  onSave,
}: {
  notes: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const [saved, setSaved] = useState(true);

  return (
    <section aria-labelledby="notes-heading">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2
            id="notes-heading"
            className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]"
          >
            Notes
          </h2>
          <p className="mt-1 text-sm text-[var(--muted-2)]">
            Recruiter contacts, referrals, follow-up dates
          </p>
        </div>
        <span
          className={cn(
            "text-xs font-medium transition-opacity motion-reduce:transition-none",
            saved ? "text-[var(--muted-2)]" : "text-emerald-400"
          )}
          aria-live="polite"
        >
          {saved ? "Saved" : "Saving…"}
        </span>
      </div>

      <div
        className={cn(
          "rounded-[var(--radius-lg)] border bg-[var(--panel)] p-1",
          "shadow-[var(--shadow-sm),inset_0_1px_0_rgba(255,255,255,0.04)]"
        )}
        style={{ borderColor: "var(--border)" }}
      >
        <textarea
          value={notes}
          onChange={(e) => {
            setSaved(false);
            onChange(e.target.value);
          }}
          onBlur={() => {
            onSave();
            setSaved(true);
          }}
          rows={4}
          placeholder="Recruiter name, referral, follow-up dates…"
          className={cn(
            "input-field w-full resize-y rounded-[var(--radius-md)] border-0 bg-transparent p-4 text-sm",
            "outline-none placeholder:text-[var(--muted-2)]"
          )}
          aria-labelledby="notes-heading"
        />
      </div>
    </section>
  );
}
