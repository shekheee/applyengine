"use client";

import { CoachChat } from "@/components/coach-chat";

export default function CoachPage() {
  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-[420px] flex-col overflow-hidden">
      <CoachChat />
    </div>
  );
}
