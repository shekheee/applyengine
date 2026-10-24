"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PrepFeedback } from "@/lib/types";
import { Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { MarkdownPanel } from "@/components/shared/markdown-panel";
import { shortDate } from "./dates";
import { PrepNav } from "./prep-nav";

export function PrepFeedbackHistory() {
  const [entries, setEntries] = useState<PrepFeedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPrepFeedback()
      .then(setEntries)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (!entries && !error) return <PageSkeleton />;

  return (
    <div className="page-shell mx-auto max-w-4xl pb-12">
      <PrepNav />
      <PageHeader
        title="Feedback"
        description="The nightly review of each day's attempts, newest first."
      />
      {error && <Card><p className="text-sm text-[var(--red)]">{error}</p></Card>}
      {entries && entries.length === 0 && (
        <Card>
          <EmptyState
            title="No feedback yet"
            description="After a day of logged attempts, the nightly Claude review writes its notes here."
          />
        </Card>
      )}
      <div className="space-y-4">
        {entries?.map((entry, index) => (
          <MarkdownPanel
            key={`${entry.date}-${entry.created_at}`}
            title={shortDate(entry.date)}
            markdown={entry.markdown}
            collapsible
            defaultOpen={index === 0}
          />
        ))}
      </div>
    </div>
  );
}
