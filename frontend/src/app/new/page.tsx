"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { Button, Card, Input, PageHeader, Textarea } from "@/components/ui";
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
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="New application"
        description="Upload your base resume once, then paste any job description to open a dedicated workspace with fit analysis, chat, and tailored materials."
      />

      {/* Step indicator */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          { n: 1, label: "Base resume", done: !!profile },
          { n: 2, label: "Job description", done: jobText.trim().length > 50 },
          { n: 3, label: "Analyze & open", done: false },
        ].map((step, i) => (
          <div key={step.n} className="flex items-center gap-2">
            {i > 0 && <span className="text-[var(--muted-2)]">→</span>}
            <span
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium ${
                step.done
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)]"
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--panel-3)] text-[10px]">
                {step.done ? "✓" : step.n}
              </span>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <Card className="border-red-500/30 !bg-red-500/5">
          <p className="text-sm text-red-300">{error}</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <ResumeUpload onLoaded={setProfile} />

        <Card glass>
          <h2 className="mb-1 text-lg font-semibold">Target job</h2>
          <p className="mb-4 text-xs text-[var(--muted)]">
            Paste the full posting — we&apos;ll score fit and create your application hub.
          </p>
          <div className="space-y-3">
            <Input
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="Job posting URL (optional)"
            />
            <Textarea
              value={jobText}
              onChange={setJobText}
              placeholder="Paste the full job description here…"
              rows={12}
            />
            <Button
              onClick={analyze}
              disabled={busy || !profile}
              variant="gradient"
              className="w-full sm:w-auto"
              size="lg"
            >
              {busy ? "Analyzing fit…" : "Analyze fit →"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
