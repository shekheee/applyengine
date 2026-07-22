"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Job, ResumeVersion } from "@/lib/types";
import type { ResumeDesignStyle } from "@/components/resume/style-picker";
import { ResumeLetterPreview } from "@/components/resume-letter-preview";
import { ControlsRail } from "@/components/resume/controls-rail";
import { ResumeCoachLink } from "@/components/resume/resume-coach-link";

export { ResumeCoachLink };

function formatApiError(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

function WorkspaceSkeleton() {
  return (
    <div className="grid animate-pulse gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] motion-reduce:animate-none">
      <div className="space-y-4">
        <div className="h-40 rounded-[var(--radius-lg)] bg-[var(--panel-2)]" />
        <div className="h-32 rounded-[var(--radius-lg)] bg-[var(--panel-2)]" />
        <div className="h-48 rounded-[var(--radius-lg)] bg-[var(--panel-2)]" />
      </div>
      <div className="h-[min(78vh,960px)] rounded-[var(--radius-xl)] bg-[var(--panel-2)]" />
    </div>
  );
}

export function ResumeWorkspace({
  compact = false,
  lockedJobId,
  lockedJobLabel,
  variant = "default",
}: {
  compact?: boolean;
  lockedJobId?: number;
  lockedJobLabel?: string;
  variant?: "default" | "application";
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | "">("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [resumeJobId, setResumeJobId] = useState<number | "">(lockedJobId ?? "");
  const [designState, setDesignState] = useState<"idle" | "working" | "done">("idle");
  const [designStyle, setDesignStyle] = useState<ResumeDesignStyle>("editorial");
  const [pdfState, setPdfState] = useState<"idle" | "working" | "done">("idle");
  const [docxState, setDocxState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadResumeVersions = useCallback(async (preferId?: number) => {
    const versions = await api.listResumeVersions();
    setResumeVersions(versions);
    const pick =
      preferId ??
      versions.find((v) => v.kind === "designed")?.id ??
      versions.find((v) => v.kind === "base")?.id ??
      versions[0]?.id;
    if (pick != null) setSelectedVersionId(pick);
    return versions;
  }, []);

  const loadVersionPreview = useCallback(async (versionId: number) => {
    setPreviewLoading(true);
    try {
      const version = await api.getResumeVersion(versionId);
      setPreviewHtml(version.html_content || "");
    } catch (e) {
      setPreviewHtml("");
      setError(formatApiError(e, "Couldn't load resume preview."));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [jobList, versions] = await Promise.all([
          api.listJobs().catch(() => []),
          api.listResumeVersions().catch(() => []),
        ]);
        setJobs(jobList);
        setResumeVersions(versions);
        const defaultVersion =
          versions.find((v) => v.kind === "designed")?.id ??
          versions.find((v) => v.kind === "base")?.id ??
          versions[0]?.id;
        if (defaultVersion != null) setSelectedVersionId(defaultVersion);
      } catch (e) {
        setError(formatApiError(e, "Failed to load resume workspace."));
      } finally {
        setLoaded(true);
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (lockedJobId != null) setResumeJobId(lockedJobId);
  }, [lockedJobId]);

  const isApplication = variant === "application";
  const effectiveJobId = lockedJobId ?? (resumeJobId === "" ? undefined : resumeJobId);

  useEffect(() => {
    if (selectedVersionId === "") {
      setPreviewHtml("");
      return;
    }
    void loadVersionPreview(Number(selectedVersionId));
  }, [selectedVersionId, loadVersionPreview]);

  async function generateDesignedResume() {
    setDesignState("working");
    setError("");
    try {
      const jobId = effectiveJobId;
      const result = await api.generateDesignedResume(jobId, designStyle);
      await loadResumeVersions(result.version_id);
      setSelectedVersionId(result.version_id);
      await loadVersionPreview(result.version_id);
      setDesignState("done");
      setTimeout(() => setDesignState("idle"), 6000);
    } catch (e) {
      setError(formatApiError(e, "Couldn't generate designed resume."));
      setDesignState("idle");
    }
  }

  async function downloadPdf() {
    setPdfState("working");
    setError("");
    try {
      const jobId = effectiveJobId;
      const versionId = selectedVersionId === "" ? undefined : Number(selectedVersionId);
      const { blob, filename } = await api.downloadResumePdf({ jobId, versionId });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPdfState("done");
      setTimeout(() => setPdfState("idle"), 4000);
    } catch (e) {
      setError(formatApiError(e, "Couldn't generate PDF resume."));
      setPdfState("idle");
    }
  }

  async function downloadDocx() {
    setDocxState("working");
    setError("");
    try {
      const jobId = effectiveJobId;
      const versionId = selectedVersionId === "" ? undefined : Number(selectedVersionId);
      const { blob, filename } = await api.downloadResumeDocx({ jobId, versionId });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDocxState("done");
      setTimeout(() => setDocxState("idle"), 4000);
    } catch (e) {
      setError(formatApiError(e, "Couldn't generate Word resume."));
      setDocxState("idle");
    }
  }

  if (!loaded) {
    return compact ? (
      <p className="text-sm text-[var(--muted)]">Loading resume workspace…</p>
    ) : (
      <WorkspaceSkeleton />
    );
  }

  const previewEmpty = (
    <p className="max-w-md px-6 text-center text-sm leading-relaxed text-[var(--muted)]">
      {isApplication
        ? "Generate a JD-tailored design to see the full A4 page here — or pick an existing version."
        : "Generate a designed resume or select your base upload to preview the complete A4 layout."}
    </p>
  );

  const previewPanel = (
    <ResumeLetterPreview
      html={previewHtml}
      loading={previewLoading}
      variant={compact ? "compact" : "default"}
      className={
        isApplication
          ? "lg:order-2 lg:sticky lg:top-20 lg:min-h-[min(72vh,880px)]"
          : "lg:sticky lg:top-20 lg:min-h-[min(78vh,960px)]"
      }
      minViewportHeight={isApplication ? "min(72vh, 880px)" : "min(78vh, 960px)"}
      empty={previewEmpty}
    />
  );

  const controlsPanel = (
    <ControlsRail
      compact={compact}
      isApplication={isApplication}
      lockedJobId={lockedJobId}
      lockedJobLabel={lockedJobLabel}
      resumeVersions={resumeVersions}
      selectedVersionId={selectedVersionId}
      onVersionChange={setSelectedVersionId}
      jobs={jobs}
      resumeJobId={resumeJobId}
      onJobChange={setResumeJobId}
      designStyle={designStyle}
      onStyleChange={setDesignStyle}
      designState={designState}
      onGenerate={generateDesignedResume}
      generateDisabled={designState === "working" || pdfState === "working" || docxState === "working"}
      pdfState={pdfState}
      docxState={docxState}
      onPdf={downloadPdf}
      onDocx={downloadDocx}
      exportDisabled={
        pdfState === "working" || designState === "working" || selectedVersionId === ""
      }
      error={error}
      onUploadLoaded={() => void loadResumeVersions()}
    />
  );

  if (compact && !isApplication) {
    return (
      <div className="space-y-4">
        {controlsPanel}
        {(previewLoading || previewHtml) && (
          <ResumeLetterPreview
            html={previewHtml}
            loading={previewLoading}
            variant="compact"
            minViewportHeight="min(420px, 55vh)"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={
        isApplication
          ? "grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:items-start"
          : "grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start xl:gap-8"
      }
    >
      {isApplication ? (
        <>
          {previewPanel}
          <div className={isApplication ? "lg:order-1" : undefined}>{controlsPanel}</div>
        </>
      ) : (
        <>
          {controlsPanel}
          {previewPanel}
        </>
      )}
    </div>
  );
}
