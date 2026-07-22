"use client";

import { Button, cn } from "@/components/ui";
import { api } from "@/lib/api";
import type { Application } from "@/lib/types";
import { useState } from "react";

type MaterialsTab = "cover_letter" | "interview_prep";

export function MaterialsPanel({
  app,
  onGenerate,
  genBusy,
}: {
  app: Application;
  onGenerate: () => void;
  genBusy: boolean;
}) {
  const [materialsTab, setMaterialsTab] = useState<MaterialsTab>("cover_letter");
  const materialsContent =
    materialsTab === "cover_letter" ? app.cover_letter : app.interview_prep;

  const subTabs: { id: MaterialsTab; label: string }[] = [
    { id: "cover_letter", label: "Cover letter" },
    { id: "interview_prep", label: "Interview prep" },
  ];

  return (
    <>
      <div
        className="inline-flex gap-1 rounded-[var(--radius-md)] border bg-[var(--panel-2)] p-1"
        style={{ borderColor: "var(--border)" }}
        role="tablist"
        aria-label="Material type"
      >
        {subTabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={materialsTab === id}
            data-active={materialsTab === id}
            onClick={() => setMaterialsTab(id)}
            className={cn(
              "tab-pill rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium",
              materialsTab === id
                ? "bg-[var(--panel)] text-[var(--text)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="mt-4 min-h-[240px] rounded-[var(--radius-md)] border bg-[var(--panel-2)]"
        style={{ borderColor: "var(--border)" }}
        role="tabpanel"
      >
        {materialsContent?.trim() ? (
          <div className="p-5 sm:p-6">
            {materialsTab === "cover_letter" && (
              <div className="mb-4 flex justify-end">
                <Button
                  href={api.exportUrl(app.id, "cover_letter")}
                  variant="outline"
                  size="sm"
                >
                  Export .docx
                </Button>
              </div>
            )}
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text)]/90">
              {materialsContent}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm font-medium text-[var(--text)]">No content yet</p>
            <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
              Generate tailored cover letter and interview prep notes for this application.
            </p>
            <Button
              onClick={onGenerate}
              disabled={genBusy}
              size="sm"
              className="mt-4"
            >
              {genBusy ? "Generating…" : "Generate all"}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
