"use client";

import { ResumeWorkspace } from "@/components/resume-workspace";

export default function ResumePage() {
  return (
    <div className="resume-studio page-enter mx-auto max-w-[1440px] space-y-8 pb-8">
      <header className="space-y-4 border-b pb-8" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center rounded-full border bg-[var(--panel-2)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--primary-2)]" style={{ borderColor: "color-mix(in srgb, var(--primary) 30%, var(--border))" }}>
            Document studio
          </span>
          <span className="text-[11px] text-[var(--muted-2)]">Claude Opus · Professional A4 templates</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">
              Resume
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              A preview-first workspace for your one-page resume. Upload your base document, generate a
              premium design, inspect the full A4 canvas, then export a Chromium-rendered PDF or
              Google Docs–ready Word file.
            </p>
          </div>
          <dl className="hidden shrink-0 gap-6 sm:grid sm:grid-cols-3">
            {[
              ["210×297", "A4 page"],
              ["1 page", "PDF export"],
              ["2 styles", "Editorial · Executive"],
            ].map(([value, label]) => (
              <div key={label} className="text-right">
                <dt className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-2)]">
                  {label}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <ResumeWorkspace />
    </div>
  );
}
