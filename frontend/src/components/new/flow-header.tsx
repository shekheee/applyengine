"use client";

import { Badge } from "@/components/ui";

export function NewFlowHeader() {
  return (
    <header className="mb-8 animate-fade-up">
      <Badge tone="primary">Create</Badge>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
        New application
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--muted)]">
        Set your base resume once, paste a job description, and we&apos;ll open a dedicated
        workspace with fit analysis, coaching, and tailored materials.
      </p>
    </header>
  );
}
