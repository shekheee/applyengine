"use client";

import { ResumeWorkspace } from "@/components/resume-workspace";

export default function ResumePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Resume</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Design Lab–quality HTML resumes powered by Claude Opus — rich typography, layout, and
          color in the live preview. Export a one-page PDF (Chromium-rendered) or Google Docs–ready Word.
        </p>
      </div>
      <ResumeWorkspace />
    </div>
  );
}
