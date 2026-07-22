"use client";

import { Button } from "@/components/ui";

export function ExportSection({
  pdfState,
  docxState,
  onPdf,
  onDocx,
  disabled,
}: {
  pdfState: "idle" | "working" | "done";
  docxState: "idle" | "working" | "done";
  onPdf: () => void;
  onDocx: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        Export the <strong className="font-medium text-[var(--text-secondary)]">selected version</strong>{" "}
        above. PDF is Chromium-rendered at US Letter size; DOCX opens cleanly in Google Docs.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          onClick={onPdf}
          disabled={disabled || pdfState === "working"}
          variant="outline"
          className="justify-center"
          aria-busy={pdfState === "working"}
        >
          {pdfState === "working" ? "Rendering PDF…" : pdfState === "done" ? "✓ PDF downloaded" : "PDF (1 page)"}
        </Button>
        <Button
          onClick={onDocx}
          disabled={disabled || docxState === "working"}
          variant="outline"
          className="justify-center"
          aria-busy={docxState === "working"}
        >
          {docxState === "working"
            ? "Building DOCX…"
            : docxState === "done"
              ? "✓ DOCX downloaded"
              : "Google Docs (.docx)"}
        </Button>
      </div>
    </div>
  );
}
