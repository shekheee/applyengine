"use client";

import { ResumeWorkspace } from "@/components/resume-workspace";
import { PageHeader } from "@/components/ui";

export default function ResumePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Resume"
        description="Design Lab–quality HTML resumes powered by Claude Opus. Preview the full US Letter page, then export a Chromium-rendered PDF or Google Docs–ready Word file."
      />
      <ResumeWorkspace />
    </div>
  );
}
