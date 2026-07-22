"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button, cn } from "@/components/ui";

/** ISO A4 at 96 CSS px/in — matches PDF print dimensions (210mm × 297mm). */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;
export const A4_ASPECT = A4_HEIGHT_PX / A4_WIDTH_PX; // ~1.414

/** @deprecated use A4_* — kept for imports */
export const LETTER_WIDTH_PX = A4_WIDTH_PX;
export const LETTER_HEIGHT_PX = A4_HEIGHT_PX;
export const LETTER_ASPECT = A4_ASPECT;

export type PreviewZoomMode = "fit" | "width" | "100";

type ResumeLetterPreviewProps = {
  html: string;
  loading?: boolean;
  empty?: ReactNode;
  className?: string;
  /** Minimum viewport height for the preview hero area. */
  minViewportHeight?: string;
  /** Premium studio chrome — full toolbar + desk surface */
  variant?: "default" | "compact";
};

function openHtmlInNewTab(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const ZOOM_MODES: { mode: PreviewZoomMode; label: string; short: string }[] = [
  { mode: "fit", label: "Fit page", short: "Fit" },
  { mode: "width", label: "Fit width", short: "Width" },
  { mode: "100", label: "100%", short: "100%" },
];

export function ResumeLetterPreview({
  html,
  loading = false,
  empty,
  className,
  minViewportHeight = "min(78vh, 920px)",
  variant = "default",
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
    const pad = variant === "compact" ? 24 : 40;
    const availW = Math.max(viewportSize.width - pad, 120);
    const availH = Math.max(viewportSize.height - pad, 120);

    if (zoomMode === "100") return 1;
    if (zoomMode === "width") return availW / A4_WIDTH_PX;
    return Math.min(availW / A4_WIDTH_PX, availH / A4_HEIGHT_PX, 1.25);
  }, [viewportSize, zoomMode, variant]);

  const scaledW = A4_WIDTH_PX * scale;
  const scaledH = A4_HEIGHT_PX * scale;

  const zoomLabel = ZOOM_MODES.find((z) => z.mode === zoomMode)?.label ?? "Fit page";
  const isStudio = variant === "default";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--panel)] shadow-[var(--shadow-lg)]",
        isStudio && "ring-1 ring-[color-mix(in_srgb,var(--border-strong)_80%,transparent)]",
        className
      )}
      style={{ borderColor: "var(--border)" }}
    >
      {/* Toolbar */}
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] border bg-[var(--panel-2)] text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]"
            style={{ borderColor: "var(--border)" }}
            aria-hidden
          >
            A4
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-[var(--text-secondary)]">
              {loading ? "Loading preview…" : html ? "A4 · 210 × 297 mm" : "Document preview"}
            </p>
            {html && !loading && (
              <p className="text-[10px] text-[var(--muted-2)]">Professional template · export-matched A4 proportions</p>
            )}
          </div>
          {html && !loading && (
            <span className="hidden rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,var(--panel-2))] px-2 py-0.5 text-[10px] font-medium text-[var(--primary-2)] sm:inline-flex">
              Live
            </span>
          )}
        </div>

        {html && !loading && (
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-[var(--radius-md)] border bg-[var(--panel-2)] p-0.5"
              style={{ borderColor: "var(--border)" }}
              role="group"
              aria-label="Preview zoom"
            >
              {ZOOM_MODES.map(({ mode, label, short }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setZoomMode(mode)}
                  aria-pressed={zoomMode === mode}
                  className={cn(
                    "rounded-[calc(var(--radius-md)-2px)] px-2.5 py-1 text-[10px] font-medium transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--primary)_50%,transparent)]",
                    zoomMode === mode
                      ? "bg-[var(--primary)] text-white shadow-[0_1px_8px_-2px_var(--glow)]"
                      : "text-[var(--muted)] hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
                  )}
                >
                  <span className="sm:hidden">{short}</span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-[10px] font-medium"
              onClick={() => openHtmlInNewTab(html)}
            >
              Open ↗
            </Button>
          </div>
        )}
      </div>

      {/* Desk / viewport */}
      <div
        ref={viewportRef}
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-6",
          isStudio
            ? "bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,color-mix(in_srgb,var(--panel-3)_90%,var(--bg))_0%,var(--bg-elevated)_100%)]"
            : "bg-[var(--panel-2)]"
        )}
        style={{ minHeight: minViewportHeight }}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
            <div
              className="relative overflow-hidden rounded-sm bg-white/95 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)] motion-safe:animate-pulse motion-reduce:animate-none"
              style={{ width: Math.min(scaledW || 280, 320), height: Math.min(scaledH || 360, 414) }}
              aria-hidden
            >
              <div className="absolute inset-0 bg-gradient-to-b from-[var(--panel-3)]/20 to-transparent" />
            </div>
            <p className="text-sm text-[var(--muted)]">Loading resume preview…</p>
          </div>
        ) : html ? (
          <div
            className="shrink-0 motion-safe:transition-[width,height] motion-safe:duration-300 motion-reduce:transition-none"
            style={{ width: scaledW, height: scaledH }}
            aria-label={`Resume preview at ${Math.round(scale * 100)}% (${zoomLabel})`}
          >
            {/* Paper stack shadow */}
            <div
              className="relative origin-top-left"
              style={{
                width: A4_WIDTH_PX,
                height: A4_HEIGHT_PX,
                transform: `scale(${scale})`,
              }}
            >
              <div
                className="pointer-events-none absolute -bottom-2 left-1/2 h-4 w-[92%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-md"
                aria-hidden
              />
              <div
                className="relative bg-white shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_28px_80px_-20px_rgba(0,0,0,0.65),0_8px_24px_-8px_rgba(0,0,0,0.4),0_0_0_1px_rgba(0,0,0,0.06)] motion-safe:transition-shadow motion-safe:duration-300 motion-reduce:transition-none"
                style={{
                  width: LETTER_WIDTH_PX,
                  height: LETTER_HEIGHT_PX,
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
          </div>
        ) : (
          empty ?? (
            <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
              <div
                className="grid h-14 w-14 place-items-center rounded-2xl border bg-[var(--panel)] text-xl shadow-[var(--shadow-sm)]"
                style={{ borderColor: "var(--border)" }}
                aria-hidden
              >
                📄
              </div>
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                Select or generate a version to see the full page preview.
              </p>
            </div>
          )
        )}
      </div>

      {html && !loading && scale > 0 && (
        <div
          className="flex shrink-0 items-center justify-center gap-2 border-t px-4 py-2 text-[10px] tabular-nums text-[var(--muted)]"
          style={{ borderColor: "var(--border)" }}
        >
          <span>{zoomLabel}</span>
          <span className="text-[var(--muted-2)]" aria-hidden>
            ·
          </span>
          <span>{Math.round(scale * 100)}%</span>
          <span className="hidden text-[var(--muted-2)] sm:inline" aria-hidden>
            ·
          </span>
          <span className="hidden sm:inline">Whole page at A4 proportions</span>
        </div>
      )}
    </div>
  );
}
