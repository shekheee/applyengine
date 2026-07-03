"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { Button, Card, Textarea } from "@/components/ui";
import { ResumeUpload } from "@/components/resume-upload";

export default function NewApplicationPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobText, setJobText] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        <ResumeUpload onLoaded={setProfile} />

        <Card>
          <h2 className="mb-3 font-medium">Target job</h2>
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
