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
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-[420px] flex-col overflow-hidden">
      <CoachChat initialConversationId={initialConversationId} />
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
