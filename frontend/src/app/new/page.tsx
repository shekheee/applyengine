"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { ErrorAlert } from "@/components/new/error-alert";
import { NewFlowHeader } from "@/components/new/flow-header";
import { JobDescriptionPanel } from "@/components/new/job-description-panel";
import { ResumeStepSection } from "@/components/new/resume-step-section";
import { StepIndicator } from "@/components/new/step-indicator";
import { SubmitBar } from "@/components/new/submit-bar";
import { JD_MIN_CHARS, useFlowSteps } from "@/components/new/use-flow-steps";

export default function NewApplicationPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobText, setJobText] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hasProfile = !!profile;
  const hasJob = jobText.trim().length >= JD_MIN_CHARS;
  const canSubmit = hasProfile && hasJob && !busy;

  const steps = useFlowSteps(hasProfile, jobText, busy);

  async function analyze() {
    setError("");
    if (!profile) return setError("Add your base resume before continuing.");
    if (!jobText.trim()) return setError("Paste a job description to analyze.");
    if (jobText.trim().length < JD_MIN_CHARS) {
      return setError(`Add more job detail — at least ${JD_MIN_CHARS} characters for accurate scoring.`);
    }
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
    <div className="page-enter mx-auto min-w-0 max-w-3xl pb-8 lg:max-w-4xl">
      <NewFlowHeader />
      <StepIndicator steps={steps} />

      {error && <ErrorAlert message={error} />}

      <div className="space-y-10 lg:space-y-12">
        <ResumeStepSection profile={profile} onLoaded={setProfile} />
        <JobDescriptionPanel
          jobText={jobText}
          jobUrl={jobUrl}
          onJobTextChange={setJobText}
          onJobUrlChange={setJobUrl}
          disabled={busy}
        />
      </div>

      <SubmitBar
        busy={busy}
        canSubmit={canSubmit}
        onSubmit={analyze}
        requirements={[
          { id: "resume", label: "Base resume uploaded", met: hasProfile },
          { id: "jd", label: "Job description pasted", met: hasJob },
        ]}
      />
    </div>
  );
}
