"use client";

import { Button, Label, Select, cn } from "@/components/ui";
import type { ResumeDesignStyle } from "@/components/resume/style-picker";
import type { CoachModel } from "@/lib/types";

export function GenerateSection({
  designState,
  designStyle,
  models,
  resumeModel,
  onModelChange,
  onGenerate,
  disabled,
  isApplication,
  lockedJobLabel,
}: {
  designState: "idle" | "working" | "done";
  designStyle: ResumeDesignStyle;
  models: CoachModel[];
  resumeModel: string;
  onModelChange: (modelId: string) => void;
  onGenerate: () => void;
  disabled?: boolean;
  isApplication?: boolean;
  lockedJobLabel?: string;
}) {
  const working = designState === "working";
  const done = designState === "done";

  return (
    <div className="space-y-3">
      {models.length > 0 && (
        <div>
          <Label htmlFor="resume-content-model">Content model</Label>
          <Select
            id="resume-content-model"
            value={resumeModel}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={working}
          >
            {models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.provider_label}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div
        className={cn(
          "rounded-[var(--radius-md)] border px-3 py-3 text-xs leading-relaxed",
          working
            ? "border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_8%,var(--panel-2))]"
            : "border-[var(--border)] bg-[var(--panel-2)]"
        )}
      >
        <p className="font-medium text-[var(--text-secondary)]">What Generate does</p>
        <p className="mt-1.5 text-[var(--muted)]">
          {isApplication ? (
            <>
              ApplyEngine redesigns your <strong className="font-medium text-[var(--text)]">base upload</strong>{" "}
              for{" "}
              {lockedJobLabel ? (
                <strong className="font-medium text-[var(--primary-2)]">{lockedJobLabel}</strong>
              ) : (
                "this role"
              )}
              . It saves a <em>new designed version</em> — your original file stays untouched.
            </>
          ) : (
            <>
              The selected model tightens and prioritises your verified experience. ApplyEngine then renders it
              with fixed A4 typography, factual contact details, bounded skills, and a three-bullet-per-role budget.
            </>
          )}
        </p>
        <p className="mt-2 text-[11px] text-[var(--muted-2)]">
          Style:{" "}
          {designStyle === "signature"
            ? "Signature sidebar"
            : designStyle === "editorial"
              ? "Modern editorial"
              : designStyle === "executive"
                ? "Teal sidebar"
                : "Refined minimal"}{" "}
          · PDF uses Chromium print for pixel fidelity
        </p>
      </div>

      <Button
        onClick={onGenerate}
        disabled={disabled || working}
        className={cn(
          "relative w-full overflow-hidden",
          working && "motion-safe:animate-[pulse-glow_2s_ease-in-out_infinite]"
        )}
        aria-busy={working}
      >
        {working ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span
              className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none"
              aria-hidden
            />
            Designing your resume…
          </span>
        ) : done ? (
          "✓ New version saved — preview updated"
        ) : isApplication ? (
          "Generate for this role"
        ) : (
          "Generate designed resume"
        )}
      </Button>

      {!working && !done && (
        <p className="text-center text-[10px] leading-snug text-[var(--muted-2)]">
          Typically 15–30 seconds · creates a new version you can switch anytime
        </p>
      )}

      {working && (
        <p className="text-center text-[10px] text-[var(--primary-2)] motion-safe:animate-pulse motion-reduce:animate-none">
          Applying {designStyle} layout · do not close this tab
        </p>
      )}
    </div>
  );
}
