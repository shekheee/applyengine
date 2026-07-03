"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { Badge, Button, Card, Textarea } from "@/components/ui";

export default function NewApplicationPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [jobText, setJobText] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.latestProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  async function saveProfile() {
    setError("");
    if (!resumeText.trim()) return setError("Paste your resume first.");
    setBusy(true);
    try {
      setProfile(await api.createProfile(resumeText));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  async function uploadResume(file: File) {
    setError("");
    setBusy(true);
    try {
      setProfile(await api.uploadProfile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    setError("");
    if (!profile) return setError("Add your profile first.");
    if (!jobText.trim()) return setError("Paste a job description.");
    setBusy(true);
    try {
      const job = await api.createJob(jobText, jobUrl);
      const app = await api.createApplication(job.id);
      router.push(`/applications/${app.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New application</h1>
        <p className="text-sm text-[var(--muted)]">
          Add your profile once, then paste any job to get a fit score and tailored
          materials.
        </p>
      </div>

      {error && (
        <Card className="border-red-500/40">
          <p className="text-sm text-red-300">{error}</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">1. Your profile</h2>
            {profile && <Badge tone="green">Ready</Badge>}
          </div>

          {profile ? (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="text-[var(--muted)]">Name:</span>{" "}
                {profile.name || "—"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.slice(0, 14).map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setProfile(null);
                  setResumeText("");
                }}
              >
                Replace profile
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea
                value={resumeText}
                onChange={setResumeText}
                placeholder="Paste your master resume here…"
                rows={10}
              />
              <div className="flex items-center gap-3">
                <Button onClick={saveProfile} disabled={busy}>
                  Save profile
                </Button>
                <label className="cursor-pointer text-sm text-[var(--muted)] hover:text-[var(--text)]">
                  or upload .pdf / .docx
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && uploadResume(e.target.files[0])
                    }
                  />
                </label>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">2. Target job</h2>
          <div className="space-y-3">
            <input
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="Job posting URL (optional)"
              className="w-full rounded-lg border bg-[var(--panel-2)] p-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
              style={{ borderColor: "var(--border)" }}
            />
            <Textarea
              value={jobText}
              onChange={setJobText}
              placeholder="Paste the full job description here…"
              rows={10}
            />
            <Button onClick={analyze} disabled={busy}>
              {busy ? "Analyzing…" : "Analyze fit →"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
