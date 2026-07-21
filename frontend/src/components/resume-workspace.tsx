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

export function ResumeWorkspace({ compact = false }: { compact?: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resumeVersions, setResumeVersions] = useState<ResumeVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | "">("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [resumeJobId, setResumeJobId] = useState<number | "">("");
  const [designState, setDesignState] = useState<"idle" | "working" | "done">("idle");
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
      const jobId = resumeJobId === "" ? undefined : resumeJobId;
      const result = await api.generateDesignedResume(jobId);
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
      const jobId = resumeJobId === "" ? undefined : resumeJobId;
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
      const jobId = resumeJobId === "" ? undefined : resumeJobId;
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

  return (
    <div
      className={
        compact
          ? "space-y-4"
          : "grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start"
      }
    >
      <div className="space-y-4">
        <ResumeUpload onLoaded={() => void loadResumeVersions()} compact={compact} />

        <div
          className="rounded-xl border bg-[var(--panel)] p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <h2 className="font-semibold">Versions & export</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Claude designs a single-page HTML resume. Your base upload stays saved — pick any version
            to preview and export.
          </p>

          {resumeVersions.length > 0 ? (
            <label className="mt-3 block text-xs text-[var(--muted)]">
              Active version
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
                    {v.kind === "base" ? "📄 " : "✨ "}
                    {v.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Upload a base resume, then generate a designed version.
            </p>
          )}

          {jobs.length > 0 && (
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

          <Button
            onClick={generateDesignedResume}
            disabled={designState === "working" || pdfState === "working" || docxState === "working"}
            className="mt-3 w-full"
          >
            {designState === "working"
              ? "Designing with Claude…"
              : designState === "done"
                ? "✓ New design saved"
                : "Generate designed resume"}
          </Button>

          <Button
            onClick={downloadPdf}
            disabled={pdfState === "working" || designState === "working" || selectedVersionId === ""}
            className="mt-2 w-full"
            variant="outline"
          >
            {pdfState === "working" ? "Generating PDF…" : pdfState === "done" ? "✓ PDF downloaded" : "Download PDF (1 page)"}
          </Button>

          <Button
            onClick={downloadDocx}
            disabled={docxState === "working" || designState === "working" || selectedVersionId === ""}
            className="mt-2 w-full"
            variant="outline"
          >
            {docxState === "working"
              ? "Generating Word doc…"
              : docxState === "done"
                ? "✓ .docx downloaded"
                : "Download for Google Docs (.docx)"}
          </Button>

          <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
            PDF is rendered from the HTML preview and auto-fit to one page.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>

      {!compact && (
        <div
          className="min-h-[480px] overflow-hidden rounded-xl border bg-white lg:sticky lg:top-20"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="border-b px-3 py-2 text-xs text-[var(--muted)]"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
          >
            {previewLoading ? "Loading preview…" : previewHtml ? "Live preview" : "Select or generate a version to preview"}
          </div>
          {previewHtml ? (
            <iframe
              title="Resume preview"
              srcDoc={previewHtml}
              sandbox="allow-same-origin"
              className="h-[min(80vh,900px)] w-full border-0 bg-white"
            />
          ) : (
            <div className="grid h-[min(50vh,480px)] place-items-center p-8 text-center text-sm text-[var(--muted)]">
              Generate a designed resume or select your base upload to see the layout here.
            </div>
          )}
        </div>
      )}

      {compact && (previewLoading || previewHtml) && (
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
