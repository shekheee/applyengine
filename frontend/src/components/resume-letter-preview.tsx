"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, cn } from "@/components/ui";

/** US Letter at 96 CSS px/in — matches PDF print dimensions. */
export const LETTER_WIDTH_PX = 816; // 8.5in
export const LETTER_HEIGHT_PX = 1056; // 11in
export const LETTER_ASPECT = LETTER_HEIGHT_PX / LETTER_WIDTH_PX; // ~1.294

export type PreviewZoomMode = "fit" | "width" | "100";

type ResumeLetterPreviewProps = {
  html: string;
  loading?: boolean;
  empty?: ReactNode;
  className?: string;
  /** Minimum viewport height for the preview hero area. */
  minViewportHeight?: string;
};

function openHtmlInNewTab(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ResumeLetterPreview({
  html,
  loading = false,
  empty,
  className,
  minViewportHeight = "min(78vh, 920px)",
}: ResumeLetterPreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [zoomMode, setZoomMode] = useState<PreviewZoomMode>("fit");

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const scale = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height) return 1;
    const pad = 32; // inner padding breathing room
    const availW = Math.max(viewportSize.width - pad, 120);
    const availH = Math.max(viewportSize.height - pad, 120);

    if (zoomMode === "100") return 1;
    if (zoomMode === "width") return availW / LETTER_WIDTH_PX;
    // fit — entire page visible
    return Math.min(availW / LETTER_WIDTH_PX, availH / LETTER_HEIGHT_PX, 1.25);
  }, [viewportSize, zoomMode]);

  const scaledW = LETTER_WIDTH_PX * scale;
  const scaledH = LETTER_HEIGHT_PX * scale;

  const zoomLabel =
    zoomMode === "fit"
      ? "Fit page"
      : zoomMode === "width"
        ? "Fit width"
        : "100%";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-[var(--panel)]",
        className
      )}
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--muted)]">
          <span>
            {loading ? "Loading preview…" : html ? "US Letter · 8.5×11 in" : "Preview"}
          </span>
          {html && !loading && (
            <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">
              Design Lab
            </span>
          )}
        </div>
        {html && !loading && (
          <div className="flex flex-wrap items-center gap-1">
            <div
              className="inline-flex rounded-lg border p-0.5"
              style={{ borderColor: "var(--border)" }}
              role="group"
              aria-label="Preview zoom"
            >
              {(
                [
                  ["fit", "Fit page"],
                  ["width", "Fit width"],
                  ["100", "100%"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setZoomMode(mode)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                    zoomMode === mode
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-[10px]"
              onClick={() => openHtmlInNewTab(html)}
            >
              Open ↗
            </Button>
          </div>
        )}
      </div>

      <div
        ref={viewportRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[var(--panel-2)] p-4"
        style={{ minHeight: minViewportHeight }}
      >
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading resume preview…</p>
        ) : html ? (
          <div
            className="shrink-0"
            style={{ width: scaledW, height: scaledH }}
            aria-label={`Resume preview at ${Math.round(scale * 100)}% (${zoomLabel})`}
          >
            <div
              className="origin-top-left bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.06)]"
              style={{
                width: LETTER_WIDTH_PX,
                height: LETTER_HEIGHT_PX,
                transform: `scale(${scale})`,
              }}
            >
              <iframe
                title="Resume page preview"
                srcDoc={html}
                sandbox="allow-same-origin allow-popups"
                className="block border-0 bg-white"
                style={{
                  width: LETTER_WIDTH_PX,
                  height: LETTER_HEIGHT_PX,
                }}
              />
            </div>
          </div>
        ) : (
          empty ?? (
            <p className="max-w-sm px-6 text-center text-sm text-[var(--muted)]">
              Select or generate a version to see the full page preview.
            </p>
          )
        )}
      </div>

      {html && !loading && scale > 0 && (
        <div
          className="shrink-0 border-t px-3 py-1.5 text-center text-[10px] text-[var(--muted)]"
          style={{ borderColor: "var(--border)" }}
        >
          {zoomLabel} · {Math.round(scale * 100)}% · whole page visible at Letter proportions
        </div>
      )}
    </div>
  );
}
