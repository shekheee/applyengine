"use client";

import type { Job, ResumeVersion } from "@/lib/types";
import { ResumeUpload } from "@/components/resume-upload";
import { SectionShell } from "./section-shell";
import { VersionPicker } from "./version-picker";
import { StylePicker } from "./style-picker";
import { GenerateSection } from "./generate-section";
import { ExportSection } from "./export-section";
import { Select } from "@/components/ui";

export function ControlsRail({
  compact,
  isApplication,
  lockedJobId,
  lockedJobLabel,
  resumeVersions,
  selectedVersionId,
  onVersionChange,
  jobs,
  resumeJobId,
  onJobChange,
  designStyle,
  onStyleChange,
  designState,
  onGenerate,
  generateDisabled,
  pdfState,
  docxState,
  onPdf,
  onDocx,
  exportDisabled,
  error,
  onUploadLoaded,
}: {
  compact?: boolean;
  isApplication?: boolean;
  lockedJobId?: number;
  lockedJobLabel?: string;
  resumeVersions: ResumeVersion[];
  selectedVersionId: number | "";
  onVersionChange: (id: number | "") => void;
  jobs: Job[];
  resumeJobId: number | "";
  onJobChange: (id: number | "") => void;
  designStyle: "editorial" | "executive";
  onStyleChange: (style: "editorial" | "executive") => void;
  designState: "idle" | "working" | "done";
  onGenerate: () => void;
  generateDisabled?: boolean;
  pdfState: "idle" | "working" | "done";
  docxState: "idle" | "working" | "done";
  onPdf: () => void;
  onDocx: () => void;
  exportDisabled?: boolean;
  error?: string;
  onUploadLoaded: () => void;
}) {
  return (
    <aside
      className="flex min-h-0 flex-col gap-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1 lg:[scrollbar-width:thin]"
      aria-label="Resume workspace controls"
    >
      <SectionShell
        title="Base resume"
        description="Your source document — uploads, replaces, and feeds every design."
        icon="📄"
      >
        <ResumeUpload onLoaded={onUploadLoaded} compact={compact || isApplication} />
      </SectionShell>

      <SectionShell
        title={isApplication ? "Version & export" : "Versions"}
        description={
          isApplication
            ? "Pick which version to preview and download."
            : "Switch between your original upload and Claude-designed versions."
        }
        icon="◇"
        accent="primary"
      >
        <VersionPicker
          versions={resumeVersions}
          value={selectedVersionId}
          onChange={onVersionChange}
          label={isApplication ? "Version to preview / export" : "Active version"}
        />

        {jobs.length > 0 && lockedJobId == null && (
          <div className="mt-4 space-y-2">
            <label
              htmlFor="resume-job-tailor"
              className="block text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]"
            >
              Tailor new design to job
              <span className="ml-1 font-normal normal-case tracking-normal text-[var(--muted-2)]">
                (optional)
              </span>
            </label>
            <Select
              id="resume-job-tailor"
              value={resumeJobId}
              onChange={(e) => {
                const v = e.target.value;
                onJobChange(v === "" ? "" : Number(v));
              }}
            >
              <option value="">General resume</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} @ {j.company}
                </option>
              ))}
            </Select>
          </div>
        )}

        {lockedJobId != null && (
          <p className="mt-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,var(--panel-2))] px-3 py-2 text-xs leading-relaxed text-[var(--primary-2)]">
            Designs generated here are tailored to this job&apos;s description.
          </p>
        )}
      </SectionShell>

      <SectionShell
        title="Generate"
        description="Claude Opus builds a Design Lab–quality HTML resume from your base upload."
        icon="✦"
        accent="primary"
      >
        <div className="space-y-4">
          <StylePicker value={designStyle} onChange={onStyleChange} />
          <GenerateSection
            designState={designState}
            designStyle={designStyle}
            onGenerate={onGenerate}
            disabled={generateDisabled}
            isApplication={isApplication}
            lockedJobLabel={lockedJobLabel}
          />
        </div>
      </SectionShell>

      <SectionShell
        title="Export"
        description="Download the version selected above."
        icon="↓"
        accent="export"
      >
        <ExportSection
          pdfState={pdfState}
          docxState={docxState}
          onPdf={onPdf}
          onDocx={onDocx}
          disabled={exportDisabled}
        />
      </SectionShell>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
        >
          {error}
        </div>
      )}
    </aside>
  );
}
