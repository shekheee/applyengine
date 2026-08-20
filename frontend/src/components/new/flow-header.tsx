"use client";

import { Badge } from "@/components/ui";

export function NewFlowHeader() {
  return (
    <header className="mb-8 animate-fade-up">
      <Badge tone="primary">Create</Badge>
      <h1 className="page-title mt-3">
        New application
      </h1>
      <p className="page-description mt-3">
        Set your base resume once, paste a job description, and we&apos;ll open a dedicated
        workspace with fit analysis, coaching, and tailored materials.
      </p>
    </header>
  );
}
