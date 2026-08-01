"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Application, Profile } from "@/lib/types";
import { Button, cn } from "@/components/ui";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT =
  ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Stage = "idle" | "uploading" | "parsing" | "analyzing";
type Choice = "current" | "upload" | "paste";

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (![".pdf", ".docx", ".txt", ".md"].some((ext) => name.endsWith(ext))) {
    return "Unsupported file type. Choose a PDF, DOCX, TXT, or Markdown resume.";
  }
  if (file.size > MAX_BYTES) return "File too large (max 5 MB).";
  if (file.size === 0) return "File is empty.";
  return null;
}

function formatDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function currentResumeLabel(profile: Profile) {
  return profile.source_filename || profile.name || "Base resume";
}

export function FitResumeDialog({
  applicationId,
  onClose,
  onAnalyzed,
  onBusyChange,
}: {
  applicationId: number;
  onClose: () => void;
  onAnalyzed: (application: Application) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [choice, setChoice] = useState<Choice>("current");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [analysisPending, setAnalysisPending] = useState(false);

  const busy = stage !== "idle";

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    api
      .baseProfile()
      .then(setProfile)
      .catch(() => {
        setProfile(null);
        setChoice("upload");
      })
      .finally(() => setLoadingProfile(false));
  }, []);

  function requestClose() {
    if (!busy) onClose();
  }

  async function analyze() {
    setError("");
    setAnalysisPending(true);
    setStage("analyzing");
    try {
      const result = await api.analyzeFit(applicationId);
      onAnalyzed(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fit analysis failed. Please try again.");
    } finally {
      setStage("idle");
    }
  }

  async function upload(file: File) {
    const validation = validateFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    setAnalysisPending(false);
    setStage("uploading");
    try {
      const updated = await api.uploadProfile(file, () => setStage("parsing"));
      setProfile(updated);
      setAnalysisPending(true);
      setStage("analyzing");
      const result = await api.analyzeFit(applicationId);
      onAnalyzed(result);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't update the resume or analyze fit. Please try again."
      );
    } finally {
      setStage("idle");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submitPaste() {
    if (!pasteText.trim()) {
      setError("Paste your resume text first.");
      return;
    }
    setError("");
    setAnalysisPending(false);
    setStage("parsing");
    try {
      const updated = await api.createProfile(pasteText.trim());
      setProfile(updated);
      setAnalysisPending(true);
      setStage("analyzing");
      const result = await api.analyzeFit(applicationId);
      onAnalyzed(result);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't update the resume or analyze fit. Please try again."
      );
    } finally {
      setStage("idle");
    }
  }

  const stageLabel =
    stage === "uploading"
      ? "Uploading…"
      : stage === "parsing"
        ? "Parsing resume…"
        : stage === "analyzing"
          ? "Analyzing fit…"
          : "";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="fit-resume-dialog-title"
      aria-describedby="fit-resume-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={() => {
        if (!busy) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto overflow-x-hidden rounded-2xl border bg-[var(--panel)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      style={{ borderColor: "var(--border-strong)" }}
    >
      <div className="min-w-0 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="fit-resume-dialog-title" className="text-lg font-semibold tracking-tight">
              Choose resume for fit check
            </h2>
            <p
              id="fit-resume-dialog-description"
              className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]"
            >
              Check this role against your current resume, or replace it with an updated version.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close resume chooser"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xl text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] disabled:opacity-40"
          >
            ×
          </button>
        </div>

        <div
          className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-100"
          role="note"
        >
          Uploading or pasting replaces your base resume. Coach, Resume Studio, Social Studio, and
          future fit checks will use the new version.
        </div>

        <div className="mt-5 grid min-w-0 gap-2 sm:grid-cols-3" role="tablist" aria-label="Resume source">
          {(
            [
              ["current", "Current resume"],
              ["upload", "Upload new"],
              ["paste", "Paste text"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={choice === value}
              onClick={() => {
                setChoice(value);
                setError("");
              }}
              disabled={busy || (value === "current" && !profile)}
              className={cn(
                "min-w-0 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                choice === value
                  ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--text)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-2)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 min-w-0">
          {choice === "current" && (
            <div
              className="rounded-xl border bg-[var(--panel-2)] p-4"
              style={{ borderColor: "var(--border)" }}
            >
              {loadingProfile ? (
                <p className="text-sm text-[var(--muted)]">Loading current resume…</p>
              ) : profile ? (
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{currentResumeLabel(profile)}</p>
                    {profile.source_filename && profile.name && (
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{profile.name}</p>
                    )}
                    {profile.created_at && (
                      <p className="mt-1 text-xs text-[var(--muted-2)]">
                        Saved {formatDate(profile.created_at)}
                      </p>
                    )}
                  </div>
                  <Button onClick={analyze} disabled={busy} size="sm" className="shrink-0">
                    {stage === "analyzing" ? "Analyzing fit…" : "Use current resume"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  No base resume is available yet. Upload or paste one to continue.
                </p>
              )}
            </div>
          )}

          {choice === "upload" && (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                if (!busy) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                const file = event.dataTransfer.files?.[0];
                if (file && !busy) upload(file);
              }}
              onClick={() => !busy && fileRef.current?.click()}
              onKeyDown={(event) => {
                if (!busy && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  fileRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              aria-disabled={busy}
              className={cn(
                "flex min-h-32 w-full min-w-0 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center outline-none transition-colors focus-visible:border-[var(--primary)]",
                dragOver
                  ? "border-[var(--primary)] bg-[var(--primary)]/10"
                  : "border-[var(--border)] bg-[var(--panel-2)]",
                busy && "cursor-not-allowed opacity-60"
              )}
            >
              <span className="text-sm font-semibold">{stageLabel || "Choose a resume file"}</span>
              <span className="mt-1 max-w-full break-words text-xs text-[var(--muted)]">
                Drag and drop or click · PDF, DOCX, TXT, or MD · max 5 MB
              </span>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload(file);
                }}
              />
            </div>
          )}

          {choice === "paste" && (
            <div className="min-w-0 space-y-3">
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder="Paste your updated resume text…"
                rows={8}
                disabled={busy}
                className="w-full min-w-0 resize-y rounded-xl border bg-[var(--panel-2)] p-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)] disabled:opacity-60"
                style={{ borderColor: "var(--border)" }}
              />
              <Button onClick={submitPaste} disabled={busy || !pasteText.trim()} size="sm">
                {stageLabel || "Replace resume and check fit"}
              </Button>
            </div>
          )}
        </div>

        {stageLabel && choice === "current" && stage !== "analyzing" && (
          <p className="mt-4 text-sm text-[var(--muted)]" aria-live="polite">
            {stageLabel}
          </p>
        )}

        {error && (
          <div
            className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3"
            role="alert"
          >
            <p className="break-words text-sm text-red-200">{error}</p>
            {analysisPending && (
              <Button className="mt-3" variant="outline" size="sm" onClick={analyze} disabled={busy}>
                Try fit analysis again
              </Button>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
