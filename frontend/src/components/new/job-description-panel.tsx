"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Input, Label, cn } from "@/components/ui";

const MIN_CHARS = 50;
const IDEAL_CHARS = 200;

function wordCount(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function PasteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M7 3.5h6a1.5 1.5 0 011.5 1.5v1H5.5V5a1.5 1.5 0 011.5-1.5z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <rect
        x="4"
        y="6"
        width="12"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}

export function JobDescriptionPanel({
  jobText,
  jobUrl,
  onJobTextChange,
  onJobUrlChange,
  disabled,
}: {
  jobText: string;
  jobUrl: string;
  onJobTextChange: (value: string) => void;
  onJobUrlChange: (value: string) => void;
  disabled?: boolean;
}) {
  const textareaId = useId();
  const urlId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const chars = jobText.trim().length;
  const words = useMemo(() => wordCount(jobText), [jobText]);
  const quality =
    chars === 0 ? "empty" : chars < MIN_CHARS ? "low" : chars < IDEAL_CHARS ? "good" : "great";

  const qualityLabel = {
    empty: "Paste the full posting for accurate fit scoring",
    low: "Add more detail — include requirements and responsibilities",
    good: "Good length — add perks or qualifications if available",
    great: "Strong detail — ready to analyze",
  }[quality];

  const qualityTone = {
    empty: "text-[var(--muted-2)]",
    low: "text-amber-300/90",
    good: "text-[var(--muted)]",
    great: "text-emerald-300/90",
  }[quality];

  return (
    <section
      id="step-job"
      aria-labelledby="job-step-title"
      className="animate-fade-up"
      style={{ animationDelay: "120ms" }}
    >
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-2)]">
          Step 2
        </p>
        <h2 id="job-step-title" className="mt-1 text-lg font-semibold tracking-tight">
          Target job
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Paste the complete job description — we&apos;ll extract requirements and score your fit.
        </p>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--panel)] shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-200",
          focused
            ? "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent),var(--shadow-md)]"
            : "border-[var(--border)]",
          disabled && "pointer-events-none opacity-60"
        )}
      >
        <div className="border-b border-[var(--border)] bg-[var(--panel-2)]/60 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <PasteIcon />
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Paste job description
              </span>
            </div>
            <span className="hidden h-4 w-px bg-[var(--border)] sm:block" aria-hidden />
            <span className="text-xs text-[var(--muted-2)]">
              Copy from LinkedIn, Greenhouse, Lever, or company careers pages
            </span>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <Label htmlFor={urlId}>Posting URL</Label>
            <Input
              id={urlId}
              value={jobUrl}
              onChange={(e) => onJobUrlChange(e.target.value)}
              placeholder="https://… (optional, for reference)"
              type="url"
              autoComplete="url"
              disabled={disabled}
              aria-describedby={`${urlId}-hint`}
            />
            <p id={`${urlId}-hint`} className="mt-1.5 text-xs text-[var(--muted-2)]">
              Optional link saved with the application for quick access later.
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <Label htmlFor={textareaId}>Job description</Label>
              <div
                className="flex items-center gap-2 text-xs tabular-nums text-[var(--muted-2)]"
                aria-live="polite"
              >
                <span>{words} words</span>
                <span aria-hidden>·</span>
                <span>{chars} chars</span>
              </div>
            </div>

            <div className="relative">
              {!jobText.trim() && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-3 text-sm leading-relaxed text-[var(--muted-2)]"
                  aria-hidden
                >
                  <p>Paste responsibilities, requirements, and qualifications…</p>
                  <ul className="mt-3 space-y-1.5 text-xs">
                    <li>• Include must-have skills and years of experience</li>
                    <li>• Add team context or tech stack if listed</li>
                    <li>• More detail improves fit score accuracy</li>
                  </ul>
                </div>
              )}
              <textarea
                ref={textareaRef}
                id={textareaId}
                value={jobText}
                onChange={(e) => onJobTextChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                disabled={disabled}
                rows={14}
                aria-describedby={`${textareaId}-hint ${textareaId}-quality`}
                aria-invalid={chars > 0 && chars < MIN_CHARS}
                className={cn(
                  "input-field min-h-[280px] w-full resize-y rounded-[var(--radius-md)] border bg-[var(--panel-2)] p-3 text-sm leading-relaxed text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-transparent sm:min-h-[320px]",
                  jobText.trim() ? "text-[var(--text)]" : "text-transparent caret-[var(--text)]"
                )}
                style={{ borderColor: "var(--border)" }}
              />
            </div>

            <p id={`${textareaId}-quality`} className={cn("mt-2 text-xs", qualityTone)}>
              {qualityLabel}
            </p>
            <p id={`${textareaId}-hint`} className="sr-only">
              Minimum {MIN_CHARS} characters recommended for analysis.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
