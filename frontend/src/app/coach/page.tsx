"use client";

import { CoachChat } from "@/components/coach-chat";

export default function CoachPage() {
  return (
    <div className="space-y-2">
      <div className="hidden lg:block">
        <h1 className="text-2xl font-semibold">Career coach</h1>
        <p className="text-sm text-[var(--muted)]">
          Your AI career copilot — pick a model below
        </p>
      </div>
      <CoachChat />
    </div>
  );
}
