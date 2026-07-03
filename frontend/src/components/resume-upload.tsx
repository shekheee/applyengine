"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";

export function ResumeUpload({
  onLoaded,
  compact = false,
}: {
  onLoaded?: (p: Profile) => void;
  compact?: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .latestProfile()
      .then((p) => {
        setProfile(p);
        onLoaded?.(p);
      })
      .catch(() => setProfile(null))
      .finally(() => setLoaded(true));
    // Report the existing profile once on mount; callers pass a stable setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function done(p: Profile) {
    setProfile(p);
    setEditing(false);
    setPasting(false);
    setText("");
    onLoaded?.(p);
  }

  async function upload(file: File) {
    setError("");
    setBusy(true);
    try {
      done(await api.uploadProfile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't parse that file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function savePasted() {
    setError("");
    if (!text.trim()) return setError("Paste your resume text first.");
    setBusy(true);
    try {
      done(await api.createProfile(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that resume.");
    } finally {
      setBusy(false);
    }
  }

  const uploader = (
    <div className="space-y-3">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:border-[var(--primary)] disabled:opacity-50"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-2xl">📄</span>
        <span className="text-sm font-medium text-[var(--text)]">
          {busy ? "Reading…" : "Upload your resume"}
        </span>
        <span className="text-xs text-[var(--muted)]">PDF, DOCX, or TXT</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />

      {pasting ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your master resume here…"
            rows={compact ? 6 : 10}
            className="w-full resize-y rounded-lg border bg-[var(--panel-2)] p-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
            style={{ borderColor: "var(--border)" }}
          />
          <div className="flex items-center gap-2">
            <Button onClick={savePasted} disabled={busy} size="sm">
              Save resume
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPasting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setPasting(true)}
          className="text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
        >
          or paste resume text instead
        </button>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );

  const body = () => {
    if (!loaded) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
    if (profile && !editing) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge tone="green">Resume loaded</Badge>
            <span className="text-sm text-[var(--muted)]">
              {profile.name || "your profile"}
            </span>
          </div>
          {profile.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.slice(0, compact ? 8 : 14).map((s) => (
                <Badge key={s}>{s}</Badge>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Replace resume
          </Button>
        </div>
      );
    }
    return uploader;
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Your resume</h2>
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Upload it once so the coach and tailoring know your real background.
      </p>
      {body()}
    </Card>
  );
}
