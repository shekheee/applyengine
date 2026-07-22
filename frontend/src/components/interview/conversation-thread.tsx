"use client";

import type { InterviewTurn } from "@/lib/types";
import { ChatMarkdown } from "@/components/chat-markdown";
import { cn, parseScoreFromContent, extractScoresFromTurn, scoreColor, scoreBgClass } from "./utils";

function TurnScore({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
        scoreBgClass(score)
      )}
    >
      {score}/10
    </span>
  );
}

function roleLabel(role: InterviewTurn["role"]): string {
  switch (role) {
    case "candidate":
      return "Your answer";
    case "feedback":
      return "Coach feedback";
    case "followup":
      return "Your follow-up";
    case "followup_reply":
      return "Coach reply";
  }
}

function roleAccent(role: InterviewTurn["role"]): string {
  switch (role) {
    case "candidate":
    case "followup":
      return "border-l-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,var(--panel))]";
    case "feedback":
      return "border-l-[var(--accent-teal)] bg-[var(--panel-2)]";
    case "followup_reply":
      return "border-l-[var(--primary-2)] bg-[var(--panel-2)]";
  }
}

export function ConversationThread({
  turns,
  streamingText,
  scrollRef,
}: {
  turns: InterviewTurn[];
  streamingText?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={scrollRef}
      className="max-h-[min(480px,50vh)] space-y-3 overflow-y-auto overscroll-contain pr-1"
    >
      {turns.length === 0 && !streamingText && (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          Your conversation with the coach will appear here.
        </p>
      )}
      {turns.map((t) => {
        const isCoach = t.role === "feedback" || t.role === "followup_reply";
        const score =
          extractScoresFromTurn(t.scores) ??
          (isCoach ? parseScoreFromContent(t.content) : null);

        return (
          <div
            key={t.id}
            className={cn(
              "rounded-[var(--radius-md)] border-l-[3px] px-4 py-3 text-sm motion-reduce:animate-none animate-fade-up",
              roleAccent(t.role)
            )}
            style={{ borderColor: "var(--border)" }}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                {roleLabel(t.role)}
              </p>
              {score != null && !Number.isNaN(score) && <TurnScore score={score} />}
            </div>
            {isCoach ? (
              <div className="prose-chat leading-relaxed">
                <ChatMarkdown content={t.content} />
              </div>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed text-[var(--text-secondary)]">
                {t.content}
              </p>
            )}
          </div>
        );
      })}

      {streamingText && (
        <div
          className="rounded-[var(--radius-md)] border-l-[3px] border-l-[var(--accent-teal)] bg-[var(--panel-2)] px-4 py-3 text-sm motion-reduce:animate-none animate-fade-up"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Coach
            </p>
            <span className="flex gap-0.5" aria-label="Generating">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1 w-1 rounded-full bg-[var(--primary-2)] motion-reduce:animate-none animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </span>
          </div>
          <div className="prose-chat leading-relaxed">
            <ChatMarkdown content={streamingText} />
            <span
              className="ml-0.5 inline-block h-4 w-0.5 motion-reduce:animate-none animate-pulse rounded-sm bg-[var(--primary-2)]"
              aria-hidden
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function ScoreRing10({ score }: { score: number | null }) {
  const value = score ?? 0;
  const pct = (value / 10) * 100;
  const color = score != null ? scoreColor(value) : "var(--muted)";

  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--panel-3)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${pct * 2.64} 264`}
          className="transition-all duration-700 motion-reduce:transition-none"
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-3xl font-semibold tabular-nums tracking-tight" style={{ color }}>
          {score != null ? score : "—"}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
          / 10
        </span>
      </div>
    </div>
  );
}
