"use client";

import { useEffect, useState } from "react";
import { Button, cn } from "@/components/ui";

type TimerState = {
  accumulatedMs: number;
  runningSince: number | null;
  firstStartedAt: number | null;
};

const EMPTY: TimerState = { accumulatedMs: 0, runningSince: null, firstStartedAt: null };

function readState(key?: string): TimerState {
  if (!key || typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as TimerState) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Seconds on a stored timer, counting a running one up to now. */
export function timerElapsedSeconds(key: string): number {
  const state = readState(key);
  const running = state.runningSince !== null ? Date.now() - state.runningSince : 0;
  return Math.round((state.accumulatedMs + Math.max(running, 0)) / 1000);
}

/** When a stored timer was first started, if it ever was. */
export function timerStartedAt(key: string): Date | null {
  const state = readState(key);
  return state.firstStartedAt !== null ? new Date(state.firstStartedAt) : null;
}

export function clearTimer(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

/**
 * Count-up timer against a target. Amber from 80% of the target, red past it.
 * With `storageKey` it survives a page reload.
 */
export function Timer({
  targetMinutes,
  onStop,
  onStart,
  storageKey,
  stopLabel = "Stop",
  compact = false,
}: {
  targetMinutes: number;
  /** `startedAt` is when the timer first started, kept across reloads. */
  onStop?: (elapsedSeconds: number, startedAt: Date | null) => void;
  onStart?: () => void;
  storageKey?: string;
  stopLabel?: string;
  /** A one-line toolbar timer with start/pause only. */
  compact?: boolean;
}) {
  const [state, setState] = useState<TimerState>(() => readState(storageKey));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Storage unavailable; the timer still runs in memory.
    }
  }, [state, storageKey]);

  useEffect(() => {
    if (state.runningSince === null) return;
    const tick = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(tick);
  }, [state.runningSince]);

  const elapsedMs =
    state.accumulatedMs + (state.runningSince !== null ? Math.max(now - state.runningSince, 0) : 0);
  const ratio = elapsedMs / (targetMinutes * 60_000);
  const tone = ratio > 1 ? "red" : ratio >= 0.8 ? "amber" : "normal";
  const running = state.runningSince !== null;
  const started = running || state.accumulatedMs > 0;

  const start = () => {
    const at = Date.now();
    setNow(at);
    if (!started) onStart?.();
    setState((s) => ({ ...s, runningSince: at, firstStartedAt: s.firstStartedAt ?? at }));
  };
  const pause = () => {
    const at = Date.now();
    setNow(at);
    setState((s) => ({
      ...s,
      accumulatedMs: s.accumulatedMs + (s.runningSince !== null ? at - s.runningSince : 0),
      runningSince: null,
    }));
  };
  const stop = () => {
    const at = Date.now();
    const total =
      state.accumulatedMs + (state.runningSince !== null ? at - state.runningSince : 0);
    setNow(at);
    setState((s) => ({ ...s, accumulatedMs: total, runningSince: null }));
    onStop?.(
      Math.round(total / 1000),
      state.firstStartedAt !== null ? new Date(state.firstStartedAt) : null
    );
  };

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-2 py-1",
          tone === "red" && "border-red-500/40 bg-red-500/10",
          tone === "amber" && "border-amber-500/40 bg-amber-500/10",
          tone === "normal" && "bg-[var(--panel-2)]"
        )}
        style={tone === "normal" ? { borderColor: "var(--border)" } : undefined}
        title={`Target ${targetMinutes} min`}
      >
        <span
          role="timer"
          aria-live="off"
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            tone === "red" && "text-red-300",
            tone === "amber" && "text-amber-300",
            tone === "normal" && "text-[var(--text)]"
          )}
        >
          {format(elapsedMs)}
        </span>
        <span className="text-[11px] text-[var(--muted)]">/ {targetMinutes}m</span>
        <button
          type="button"
          onClick={running ? pause : start}
          aria-label={running ? "Pause timer" : started ? "Resume timer" : "Start timer"}
          className="rounded px-1.5 py-0.5 text-xs font-medium text-[var(--primary-2)] hover:bg-[var(--panel-3)]"
        >
          {running ? "Pause" : started ? "Resume" : "Start"}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3",
        tone === "red" && "border-red-500/40 bg-red-500/10",
        tone === "amber" && "border-amber-500/40 bg-amber-500/10",
        tone === "normal" && "bg-[var(--panel-2)]"
      )}
      style={tone === "normal" ? { borderColor: "var(--border)" } : undefined}
    >
      <div className="min-w-[96px]">
        <p
          role="timer"
          aria-live="off"
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums",
            tone === "red" && "text-red-300",
            tone === "amber" && "text-amber-300",
            tone === "normal" && "text-[var(--text)]"
          )}
        >
          {format(elapsedMs)}
        </p>
        <p className="text-xs text-[var(--muted)]">
          target {targetMinutes} min
          {tone === "red" && " · over target"}
        </p>
      </div>
      <div className="flex gap-2">
        {running ? (
          <Button size="sm" variant="outline" onClick={pause}>
            Pause
          </Button>
        ) : (
          <Button size="sm" onClick={start}>
            {started ? "Resume" : "Start timer"}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={stop} disabled={!started}>
          {stopLabel}
        </Button>
      </div>
    </div>
  );
}
