"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CoachChat } from "@/components/coach-chat";

function CoachPageInner() {
  const params = useSearchParams();
  const raw = params.get("conversation_id");
  const parsed = raw ? Number(raw) : NaN;
  const initialConversationId = Number.isFinite(parsed) ? parsed : undefined;

  return (
    <div className="coach-page flex h-[calc(100dvh-6.5rem)] min-h-[420px] flex-col overflow-hidden">
      <CoachChat initialConversationId={initialConversationId} />
      <style jsx global>{`
        .coach-page {
          --coach-read-width: 680px;
          --coach-sidebar-width: 15rem;
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
