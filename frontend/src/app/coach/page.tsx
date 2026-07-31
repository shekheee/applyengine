"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CoachChat } from "@/components/coach-chat";
import { useCoachFullscreen } from "@/hooks/use-coach-fullscreen";
import { cn } from "@/components/ui";

function CoachPageInner() {
  const params = useSearchParams();
  const raw = params.get("conversation_id");
  const parsed = raw ? Number(raw) : NaN;
  const initialConversationId = Number.isFinite(parsed) ? parsed : undefined;
  const { fullscreen, toggleFullscreen } = useCoachFullscreen(true);

  return (
    <div
      className={cn(
        "coach-page flex min-h-0 flex-col overflow-hidden",
        fullscreen
          ? "fixed inset-0 z-[200] h-dvh w-full"
          : "h-[calc(100dvh-3.25rem)] min-h-[480px]"
      )}
      data-coach-fullscreen={fullscreen ? "true" : undefined}
    >
      <CoachChat
        initialConversationId={initialConversationId}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
      />
      <style jsx global>{`
        .coach-page {
          --coach-read-width: min(920px, 100%);
          --coach-assistant-width: min(100%, 52rem);
          --coach-sidebar-width: 15rem;
        }

        .coach-page[data-coach-fullscreen="true"] {
          --coach-read-width: min(1100px, 96vw);
          --coach-assistant-width: min(100%, 68rem);
        }

        html.coach-fullscreen header[class*="sticky"] {
          display: none;
        }

        html.coach-fullscreen main {
          max-width: none !important;
          padding: 0 !important;
        }

        html.coach-fullscreen .page-enter {
          animation: none;
        }

        .coach-thread-inner,
        .coach-composer-shell {
          max-width: var(--coach-read-width);
        }

        .coach-message-assistant {
          max-width: var(--coach-assistant-width);
        }

        .coach-thread-scroll {
          scrollbar-gutter: stable;
        }

        .coach-thread-fade {
          pointer-events: none;
          background: linear-gradient(
            to bottom,
            color-mix(in srgb, var(--bg) 88%, transparent) 0%,
            transparent 100%
          );
        }

        .coach-composer-fade {
          pointer-events: none;
          background: linear-gradient(
            to top,
            color-mix(in srgb, var(--bg) 92%, transparent) 0%,
            transparent 100%
          );
        }

        .coach-empty-icon,
        .coach-starter,
        .coach-message {
          animation: coach-fade-up 0.35s ease-out both;
        }

        @keyframes coach-fade-up {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes coach-stream-blink {
          0%,
          45% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0.25;
          }
        }

        @keyframes coach-typing-bounce {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.45;
          }
          30% {
            transform: translateY(-3px);
            opacity: 1;
          }
        }

        .coach-stream-cursor {
          animation: coach-stream-blink 1s step-end infinite;
        }

        .coach-typing-dot {
          display: inline-block;
          height: 6px;
          width: 6px;
          border-radius: 9999px;
          background: var(--muted);
          animation: coach-typing-bounce 1.2s ease-in-out infinite;
        }

        .coach-prose :where(p, li) {
          color: var(--text-secondary);
        }

        .coach-prose pre,
        .coach-prose code {
          max-width: 100%;
        }

        @media (prefers-reduced-motion: reduce) {
          .coach-empty-icon,
          .coach-starter,
          .coach-message,
          .coach-conv-sidebar {
            animation: none !important;
            transition: none !important;
          }

          .coach-stream-cursor,
          .coach-typing-dot {
            animation: none !important;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default function CoachPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[70vh] items-center justify-center text-[var(--muted)]">
          Loading coach…
        </div>
      }
    >
      <CoachPageInner />
    </Suspense>
  );
}
