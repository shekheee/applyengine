"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Job, ResumeVersion } from "@/lib/types";
import { Button } from "@/components/ui";
import { ResumeUpload } from "@/components/resume-upload";

function formatApiError(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
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
  const [resumeJobId, setResumeJobId] = useState<number | "">(
    lockedJobId ?? ""
  );
  const [designState, setDesignState] = useState<"idle" | "working" | "done">("idle");
  const [designStyle, setDesignStyle] = useState<"editorial" | "executive">("editorial");
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
    return <p className="text-sm text-[var(--muted)]">Loading resume workspace…</p>;
  }

  const previewPanel = (
    <div
      className={`overflow-hidden rounded-xl border bg-white ${
        isApplication ? "min-h-[min(75vh,920px)] lg:order-2" : "min-h-[480px] lg:sticky lg:top-20"
      }`}
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2 text-xs text-[var(--muted)]"
        style={{ borderColor: "var(--border)", background: "var(--panel)" }}
      >
        <span>
          {previewLoading ? "Loading preview…" : previewHtml ? "Live preview" : "Preview"}
        </span>
        {previewHtml && !previewLoading && (
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">
            Design Lab preview
          </span>
        )}
      </div>
      {previewHtml ? (
        <iframe
          title="Resume preview"
          srcDoc={previewHtml}
          sandbox="allow-same-origin"
          className={`w-full border-0 bg-white ${
            isApplication ? "h-[min(75vh,920px)]" : "h-[min(80vh,900px)]"
          }`}
        />
      ) : (
        <div
          className={`grid place-items-center p-8 text-center text-sm text-[var(--muted)] ${
            isApplication ? "h-[min(60vh,720px)]" : "h-[min(50vh,480px)]"
          }`}
        >
          {isApplication
            ? "Generate a JD-tailored design to see your resume layout here — or pick an existing version."
            : "Generate a designed resume or select your base upload to see the layout here."}
        </div>
      )}
    </div>
  );

  const controlsPanel = (
    <div className={`space-y-4 ${isApplication ? "lg:order-1" : ""}`}>
      <ResumeUpload onLoaded={() => void loadResumeVersions()} compact={compact || isApplication} />

      <div
        className="rounded-xl border bg-[var(--panel)] p-4"
        style={{ borderColor: "var(--border)" }}
      >
        <h2 className="font-semibold">
          {isApplication ? "Designed resume for this role" : "Versions & export"}
        </h2>
        {isApplication ? (
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            <strong className="text-[var(--text)]">Generate</strong> asks Claude to redesign your{" "}
            <em>base upload</em> for{" "}
            {lockedJobLabel ? (
              <strong className="text-[var(--primary-2)]">{lockedJobLabel}</strong>
            ) : (
              "this job"
            )}
            . It saves a <em>new version</em> — your base file stays untouched. Use{" "}
            <strong className="text-[var(--text)]">Download</strong> to export the selected version.
          </p>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            Claude Opus produces a premium Design Lab–style HTML resume — typography, layout, accent
            color, and skill chips. Preview shows the full design; PDF uses Chromium print for fidelity.
          </p>
        )}

        {resumeVersions.length > 0 ? (
          <label className="mt-3 block text-xs text-[var(--muted)]">
            {isApplication ? "Version to preview / export" : "Active version"}
            <select
              value={selectedVersionId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedVersionId(v === "" ? "" : Number(v));
              }}
              className="mt-1 w-full rounded-lg border bg-[var(--panel-2)] px-2 py-1.5 text-sm text-[var(--text)]"
              style={{ borderColor: "var(--border)" }}
            >
              {resumeVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.kind === "base" ? "📄 Base · " : "✨ Designed · "}
                  {v.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Upload a base resume first, then generate a designed version.
          </p>
        )}

        {jobs.length > 0 && lockedJobId == null && (
          <label className="mt-3 block text-xs text-[var(--muted)]">
            Tailor new design to job (optional)
            <select
              value={resumeJobId}
              onChange={(e) => {
                const v = e.target.value;
                setResumeJobId(v === "" ? "" : Number(v));
              }}
              className="mt-1 w-full rounded-lg border bg-[var(--panel-2)] px-2 py-1.5 text-sm text-[var(--text)]"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">General resume</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} @ {j.company}
                </option>
              ))}
            </select>
          </label>
        )}

        {lockedJobId != null && (
          <p className="mt-3 rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2 text-xs text-violet-200">
            New designs from this page are tailored to this job&apos;s description.
          </p>
        )}

        <div className="mt-3">
          <p className="mb-2 text-xs font-medium text-[var(--muted)]">Layout style</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["editorial", "Modern editorial", "Asymmetric header, chips, accent rule"],
                ["executive", "Clean executive", "Centered header, serif accents, restrained"],
              ] as const
            ).map(([id, label, desc]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDesignStyle(id)}
                className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  designStyle === id
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
                    : "border-[var(--border)] hover:bg-[var(--panel-2)]"
                }`}
              >
                <span className="block text-xs font-medium">{label}</span>
                <span className="block text-[10px] text-[var(--muted)]">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={generateDesignedResume}
          disabled={designState === "working" || pdfState === "working" || docxState === "working"}
          className="mt-4 w-full"
        >
          {designState === "working"
            ? "Claude is redesigning your resume…"
            : designState === "done"
              ? "✓ New tailored version saved"
              : isApplication
                ? "✨ Generate for this role"
                : "✨ Generate Design Lab resume"}
        </Button>
        <p className="mt-1.5 text-[10px] leading-snug text-[var(--muted)]">
          {isApplication
            ? "Creates a new premium HTML version with live preview — base upload stays untouched."
            : "Claude Opus · full CSS design artifact · one page when exported to PDF."}
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button
            onClick={downloadPdf}
            disabled={pdfState === "working" || designState === "working" || selectedVersionId === ""}
            variant="outline"
          >
            {pdfState === "working" ? "PDF…" : pdfState === "done" ? "✓ PDF" : "PDF (1 page)"}
          </Button>
          <Button
            onClick={downloadDocx}
            disabled={docxState === "working" || designState === "working" || selectedVersionId === ""}
            variant="outline"
          >
            {docxState === "working" ? "Word…" : docxState === "done" ? "✓ DOCX" : "Google Docs (.docx)"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <div
      className={
        compact
          ? "space-y-4"
          : isApplication
            ? "grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr] lg:items-start"
            : "grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start"
      }
    >
      {isApplication ? (
        <>
          {previewPanel}
          {controlsPanel}
        </>
      ) : (
        <>
          {controlsPanel}
          {!compact && previewPanel}
        </>
      )}

      {compact && !isApplication && (previewLoading || previewHtml) && (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--border)" }}>
          <div className="border-b px-2 py-1 text-[10px] text-[var(--muted)]" style={{ borderColor: "var(--border)" }}>
            {previewLoading ? "Loading preview…" : "Live preview"}
          </div>
          {!previewLoading && previewHtml && (
            <iframe
              title="Resume preview"
              srcDoc={previewHtml}
              sandbox="allow-same-origin"
              className="h-64 w-full border-0 bg-white"
            />
          )}
        </div>
      )}
    </div>
  );
}

export function ResumeCoachLink() {
  return (
    <div
      className="rounded-xl border bg-[var(--panel)] p-4"
      style={{ borderColor: "var(--border)" }}
    >
      <h2 className="font-semibold">Resume</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Upload, design, preview, and export PDF or Word — all on the dedicated Resume page.
      </p>
      <Button href="/resume" className="mt-3 w-full" variant="outline">
        Open Resume workspace →
      </Button>
    </div>
  );
}
