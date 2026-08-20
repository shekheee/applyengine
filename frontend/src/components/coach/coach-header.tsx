"use client";

import type { CoachMode, Conversation } from "@/lib/types";
import { Button } from "@/components/ui";
import { conversationSubtitle } from "@/components/coach-conversations";
import {
  CompressIcon,
  ExpandIcon,
  MenuIcon,
  PanelIcon,
} from "@/components/coach/coach-icons";

export function CoachHeader({
  embedded,
  activeConversation,
  convListOpen,
  onToggleConvList,
  toolsOpen,
  onToggleTools,
  openInCoachHref,
  fullscreen,
  onToggleFullscreen,
  coachMode,
  onCoachModeChange,
}: {
  embedded?: boolean;
  activeConversation: Conversation | null;
  convListOpen: boolean;
  onToggleConvList: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
  openInCoachHref: string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  coachMode: CoachMode;
  onCoachModeChange: (mode: CoachMode) => void;
}) {
  return (
    <header
      className="coach-header flex shrink-0 items-center justify-between gap-3 border-b px-2 py-2.5 sm:px-3"
      style={{
        borderColor: "var(--border)",
        background: "color-mix(in srgb, var(--panel) 92%, transparent)",
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {!embedded && !fullscreen && (
          <button
            type="button"
            onClick={onToggleConvList}
            className="btn-interactive flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-[var(--muted)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
            style={{
              borderColor: "var(--border-strong)",
              outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)",
            }}
            aria-label={convListOpen ? "Hide conversations" : "Show conversations"}
            aria-expanded={convListOpen}
          >
            <MenuIcon />
          </button>
        )}

        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-[var(--text)]">
            {activeConversation?.title ??
              (coachMode === "buddy" ? "Technical Buddy" : "Career coach")}
          </h1>
          {activeConversation && (
            <p className="truncate text-xs text-[var(--muted)]">
              {conversationSubtitle(activeConversation)}
              {embedded && activeConversation.has_jd && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--amber)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--amber)]">
                  JD
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!embedded && (
          <div
            className="flex rounded-lg border p-0.5"
            style={{ borderColor: "var(--border-strong)", background: "var(--panel-2)" }}
            aria-label="Coach mode"
          >
            <button
              type="button"
              onClick={() => onCoachModeChange("career")}
              aria-pressed={coachMode === "career"}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                coachMode === "career"
                  ? "bg-[var(--panel-3)] text-[var(--text)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              Career
            </button>
            <button
              type="button"
              onClick={() => onCoachModeChange("communication")}
              aria-pressed={coachMode === "communication"}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                coachMode === "communication"
                  ? "bg-emerald-400/15 text-emerald-300 shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              <span className="sm:hidden">Gym</span>
              <span className="hidden sm:inline">Communication Gym</span>
            </button>
            <button
              type="button"
              onClick={() => onCoachModeChange("buddy")}
              aria-pressed={coachMode === "buddy"}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                coachMode === "buddy"
                  ? "bg-sky-400/15 text-sky-300 shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              Buddy
            </button>
          </div>
        )}
        {embedded ? (
          <Button href={openInCoachHref} variant="outline" size="sm">
            Open in Coach →
          </Button>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleFullscreen}
              title={fullscreen ? "Exit full screen (Esc)" : "Full screen (F)"}
              aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}
              aria-pressed={fullscreen}
              className="btn-interactive flex h-9 w-9 items-center justify-center rounded-lg border text-[var(--muted)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                borderColor: "var(--border-strong)",
                outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)",
              }}
            >
              {fullscreen ? <CompressIcon /> : <ExpandIcon />}
            </button>
            {!fullscreen && (
              <button
                type="button"
                onClick={onToggleTools}
                className="btn-interactive flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  borderColor: "var(--border-strong)",
                  outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)",
                }}
                aria-label={toolsOpen ? "Hide memory panel" : "Show memory panel"}
                aria-expanded={toolsOpen}
              >
                <PanelIcon className="h-3.5 w-3.5" />
                {toolsOpen ? "Hide" : "Memory"}
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
