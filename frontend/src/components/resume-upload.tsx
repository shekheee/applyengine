"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const okExt = [".pdf", ".docx", ".txt", ".md"].some((ext) => name.endsWith(ext));
  if (!okExt) {
    return "Unsupported file type. Upload a PDF, DOCX, or TXT resume.";
  }
  if (file.size > MAX_BYTES) {
    return "File too large (max 5 MB).";
  }
  if (file.size === 0) {
    return "File is empty.";
  }
  return null;
}

function profileSummary(p: Profile) {
  const roles = p.experience?.length ?? 0;
  const skills = p.skills?.length ?? 0;
  const parts = [];
  if (roles) parts.push(`${roles} role${roles === 1 ? "" : "s"}`);
  if (skills) parts.push(`${skills} skill${skills === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function ResumeUpload({
  onLoaded,
  compact = false,
}: {
  onLoaded?: (p: Profile) => void;
  compact?: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const p = await api.baseProfile();
      setProfile(p);
      onLoaded?.(p);
    } catch {
      setProfile(null);
    }
  }, [onLoaded]);

  useEffect(() => {
    // Hydrate from the authenticated profile API on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().finally(() => setLoaded(true));
  }, [refresh]);

  function done(p: Profile, replaced: boolean) {
    setProfile(p);
    setPasting(false);
    setText("");
    setSuccess(
      replaced
        ? "Base resume updated — coach, fit checks, and exports will use the new version."
        : "Base resume set — coach and exports will build on this."
    );
    setTimeout(() => setSuccess(""), 5000);
    onLoaded?.(p);
  }

  async function upload(file: File) {
    setError("");
    setSuccess("");
    const validation = validateFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    const replacing = profile != null;
    setBusy(true);
    setProgress(`Uploading ${file.name}…`);
    try {
      done(await api.uploadProfile(file), replacing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't parse that file.");
    } finally {
      setBusy(false);
      setProgress("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function savePasted() {
    setError("");
    setSuccess("");
    if (!text.trim()) return setError("Paste your resume text first.");
    const replacing = profile != null;
    setBusy(true);
    setProgress("Parsing resume…");
    try {
      done(await api.createProfile(text), replacing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that resume.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  const hasProfile = profile != null;

  const uploader = (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
        }}
        aria-disabled={busy}
        className={`flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 text-center transition-colors ${
          compact || hasProfile ? "py-4" : "py-6"
        } ${busy ? "cursor-not-allowed opacity-60" : ""} ${
          dragOver ? "border-[var(--primary)] bg-[var(--primary)]/5" : ""
        }`}
        style={{ borderColor: dragOver ? undefined : "var(--border)" }}
      >
        <span className="text-2xl">{busy ? "⏳" : "📄"}</span>
        <span className="text-sm font-medium text-[var(--text)]">
          {busy
            ? progress || "Processing…"
            : hasProfile
              ? "Upload new resume"
              : "Upload your base resume"}
        </span>
        <span className="text-xs text-[var(--muted)]">
          {hasProfile
            ? "Replaces your current base resume · PDF, DOCX, or TXT · max 5 MB"
            : "Drag & drop or click · PDF, DOCX, or TXT · max 5 MB"}
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={busy}
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />

      {pasting ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your master resume here…"
            rows={compact ? 6 : 10}
            disabled={busy}
            className="w-full resize-y rounded-lg border bg-[var(--panel-2)] p-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)] disabled:opacity-60"
            style={{ borderColor: "var(--border)" }}
          />
          <div className="flex items-center gap-2">
            <Button onClick={savePasted} disabled={busy} size="sm">
              {hasProfile ? "Replace with pasted text" : "Set as base resume"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPasting(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPasting(true)}
          disabled={busy}
          className="text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline disabled:opacity-50"
        >
          {hasProfile ? "or paste new resume text" : "or paste resume text instead"}
        </button>
      )}

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {success}
        </p>
      )}
    </div>
  );

  const body = () => {
    if (!loaded) return <p className="text-sm text-[var(--muted)]">Loading…</p>;

    const skills = profile?.skills ?? [];

    return (
      <div className="space-y-4">
        {profile && (
          <div className="space-y-3">
            <div
              className="rounded-lg border bg-[var(--panel-2)] p-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green">Base resume set</Badge>
                {profile.source_filename && (
                  <span className="text-xs text-[var(--muted)]">{profile.source_filename}</span>
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-[var(--text)]">
                {profile.name || "Your profile"}
              </p>
              {profile.email && (
                <p className="text-xs text-[var(--muted)]">{profile.email}</p>
              )}
              {profileSummary(profile) && (
                <p className="mt-1 text-xs text-[var(--muted)]">{profileSummary(profile)}</p>
              )}
              <p className="mt-2 text-xs text-[var(--muted)]">
                Coach, PDF export, and tailoring build on this resume. Upload a new file below to
                replace it.
              </p>
            </div>
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {skills.slice(0, compact ? 8 : 12).map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
                {skills.length > (compact ? 8 : 12) && (
                  <Badge tone="primary">+{skills.length - (compact ? 8 : 12)}</Badge>
                )}
              </div>
            )}
          </div>
        )}

        {uploader}
      </div>
    );
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Base resume</h2>
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">
        {hasProfile
          ? "Your current base resume is shown above. Upload anytime to replace it with an updated version."
          : "Provide your real resume once — everything else builds on it."}
      </p>
      {body()}
    </Card>
  );
}
