"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { PrepMockSession, PrepMockTurn, PrepScorecard, PrepSignal } from "@/lib/types";
import { Badge, Button, cn } from "@/components/ui";

const SIGNAL_LABEL: Record<PrepSignal, string> = {
  strong_no: "Strong no hire",
  no: "No hire",
  lean_no: "Lean no hire",
  lean_yes: "Lean hire",
  yes: "Hire",
  strong_yes: "Strong hire",
};

const DIMENSIONS: Array<{ key: keyof PrepScorecard; label: string }> = [
  { key: "communication", label: "Communication" },
  { key: "problem_solving", label: "Problem solving" },
  { key: "coding", label: "Coding / design" },
  { key: "verification", label: "Testing & complexity" },
];

const mockStorageKey = (taskId: string, date: string) => `prep:mock:${taskId}:${date}`;

/** The active interview for a task today, remembered across reloads. */
export function storedMockId(taskId: string, date: string): number | null {
  try {
    const raw = window.localStorage.getItem(mockStorageKey(taskId, date));
    return raw ? Number(raw) || null : null;
  } catch {
    return null;
  }
}

export function rememberMock(taskId: string, date: string, id: number | null) {
  try {
    if (id === null) window.localStorage.removeItem(mockStorageKey(taskId, date));
    else window.localStorage.setItem(mockStorageKey(taskId, date), String(id));
  } catch {
    // Storage unavailable; the interview lasts for this visit.
  }
}

export function Scorecard({ card }: { card: PrepScorecard }) {
  const passing = ["lean_yes", "yes", "strong_yes"].includes(card.signal);
  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border p-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">Scorecard</h3>
        <Badge tone={passing ? "green" : "red"}>{SIGNAL_LABEL[card.signal]}</Badge>
        {card.offline && <Badge tone="amber">Placeholder: no AI configured</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {DIMENSIONS.map(({ key, label }) => {
          const value = Number(card[key]);
          return (
            <div key={key}>
              <p className="text-[11px] text-[var(--muted)]">{label}</p>
              <div className="mt-1 flex gap-1" aria-label={`${label}: ${value} of 4`}>
                {[1, 2, 3, 4].map((n) => (
                  <span
                    key={n}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      n <= value ? (value >= 3 ? "bg-emerald-400" : "bg-amber-400") : "bg-[var(--panel-2)]"
                    )}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {card.summary && <p className="text-sm text-[var(--text-secondary)]">{card.summary}</p>}
      {card.strengths.length > 0 && (
        <div>
          <p className="text-xs font-medium text-emerald-300">Strengths</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[var(--text-secondary)]">
            {card.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {card.improvements.length > 0 && (
        <div>
          <p className="text-xs font-medium text-amber-300">To improve</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[var(--text-secondary)]">
            {card.improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The live interviewer: a chat that sees your editor. Hints and the solution
 * stay locked until the interview ends.
 */
export function MockInterviewPanel({
  session,
  getWork,
}: {
  session: PrepMockSession;
  getWork: () => { code: string; elapsedMinutes: number };
}) {
  const [turns, setTurns] = useState<PrepMockTurn[]>(session.turns);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const active = session.status === "active";

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [turns, streaming]);

  const send = () => {
    const message = draft.trim();
    if (!message || streaming !== null) return;
    const work = getWork();
    setDraft("");
    setError(null);
    setStreaming("");
    api
      .streamPrepMockTurn(
        session.id,
        { message, code: work.code, elapsed_minutes: work.elapsedMinutes },
        (turn) => setTurns((t) => [...t, turn]),
        (token) => setStreaming((s) => (s ?? "") + token)
      )
      .then((reply) => setTurns((t) => [...t, reply]))
      .catch((err: Error) => {
        setError(err.message);
        setDraft(message);
      })
      .finally(() => setStreaming(null));
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {active && (
        <p className="text-xs text-[var(--muted)]">
          Talk to the interviewer as you would out loud: clarify, explain your approach, state the
          complexity. It sees your editor on every message. Press End interview for the scorecard.
        </p>
      )}
      <ol className="space-y-2">
        {turns.map((turn) => (
          <li
            key={turn.id}
            className={cn(
              "max-w-[92%] whitespace-pre-wrap rounded-[var(--radius-md)] px-3 py-2 text-sm leading-6",
              turn.role === "interviewer"
                ? "bg-[var(--panel-2)] text-[var(--text)]"
                : "ml-auto bg-[var(--primary)]/20 text-[var(--text)]"
            )}
          >
            {turn.content}
          </li>
        ))}
        {streaming !== null && (
          <li className="max-w-[92%] whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--panel-2)] px-3 py-2 text-sm leading-6 text-[var(--text)]">
            {streaming || "…"}
          </li>
        )}
      </ol>
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
      {session.scorecard && <Scorecard card={session.scorecard} />}
      <div ref={bottom} />
      {active && (
        <div className="sticky bottom-0 mt-auto space-y-2 bg-[var(--panel)] pt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            aria-label="Message the interviewer"
            placeholder="Say what you'd say out loud… (Enter to send, Shift+Enter for a new line)"
            className="w-full resize-none rounded-[var(--radius-md)] border bg-[var(--panel-2)] p-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted-2)]"
            style={{ borderColor: "var(--border)" }}
          />
          <Button size="sm" onClick={send} disabled={!draft.trim() || streaming !== null}>
            {streaming !== null ? "Interviewer is typing…" : "Send"}
          </Button>
        </div>
      )}
    </div>
  );
}
