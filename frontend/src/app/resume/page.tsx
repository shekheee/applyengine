"use client";

import { ResumeWorkspace } from "@/components/resume-workspace";

export default function ResumePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Resume</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Manage your base resume, generate Claude-designed HTML versions, preview layouts, and export
          one-page PDF or Google Docs–ready Word files.
        </p>
      </div>
      <ResumeWorkspace />
    </div>
  );
}
