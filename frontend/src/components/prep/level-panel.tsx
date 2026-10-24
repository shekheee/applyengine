"use client";

import { useState } from "react";
import type { PrepTestCase } from "@/lib/types";
import { ChatMarkdown } from "@/components/chat-markdown";
import { Card, cn } from "@/components/ui";

export type Level = { title: string; brief: string; tests: PrepTestCase[] };

function readUnlocked(key: string): number {
  try {
    return Math.max(1, Number(window.localStorage.getItem(key)) || 1);
  } catch {
    return 1;
  }
}

/**
 * The cases for a level are that level's tests plus every earlier level's,
 * so later changes must keep earlier behaviour working.
 */
export function cumulativeTests(levels: Level[], level: number): PrepTestCase[] {
  return levels.slice(0, level).flatMap((l, index) =>
    l.tests.map((t) => ({ ...t, name: `L${index + 1} · ${t.name}` }))
  );
}

/** Tabs for a multi-level challenge. A level opens once Submit passes the previous one. */
export function useLevels(taskId: string, total: number) {
  const key = `prep:levels:${taskId}`;
  const [unlocked, setUnlocked] = useState(() => Math.min(readUnlocked(key), total));
  const [current, setCurrent] = useState(unlocked);

  const passLevel = (level: number) => {
    if (level < unlocked || level >= total) return;
    const next = level + 1;
    setUnlocked(next);
    setCurrent(next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Storage unavailable; progress lasts for this visit.
    }
  };

  return { unlocked, current, setCurrent, passLevel };
}

export function LevelPanel({
  levels,
  current,
  unlocked,
  onSelect,
  completed,
}: {
  levels: Level[];
  current: number;
  unlocked: number;
  onSelect: (level: number) => void;
  completed: boolean;
}) {
  const level = levels[current - 1];
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Levels" className="flex flex-wrap gap-1.5">
          {levels.map((l, index) => {
            const number = index + 1;
            const locked = number > unlocked;
            const passed = number < unlocked || (completed && number === levels.length);
            return (
              <button
                key={l.title}
                type="button"
                role="tab"
                aria-selected={number === current}
                disabled={locked}
                onClick={() => onSelect(number)}
                title={locked ? "Pass the previous level with Submit to open this one" : l.title}
                className={cn(
                  "rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-medium",
                  number === current
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]",
                  locked && "cursor-not-allowed opacity-50"
                )}
                style={number === current ? undefined : { borderColor: "var(--border)" }}
              >
                {locked ? "🔒 " : passed ? "✓ " : ""}Level {number}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-[var(--muted)]">
          {completed ? "All levels passed" : `Level ${unlocked} of ${levels.length} open`}
        </span>
      </div>
      {level && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Level {current}: {level.title.replace(/^Level\s*\d+\s*[:·—-]\s*/i, "")}
          </h2>
          <div className="mt-2">
            <ChatMarkdown content={level.brief} density="compact" />
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Submit runs this level&apos;s cases and every earlier level&apos;s. Pass them all to open
            the next level.
          </p>
        </div>
      )}
    </Card>
  );
}
