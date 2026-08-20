"use client";

import { useState } from "react";
import type {
  BuddyDashboard,
  DeliveryMetrics,
  VocabularyTerm,
} from "@/lib/types";
import type { VoiceRecorderState } from "@/hooks/use-voice-recorder";
import type { RealtimeBuddyState } from "@/hooks/use-realtime-buddy";
import { DeliveryMetricsPanel, VoiceControl } from "@/components/interview/answer-composer";

const TOPICS = [
  {
    label: "Explain a concept",
    prompt:
      "Ask me to explain one technical concept relevant to my background in plain English, then explore one trade-off with me.",
  },
  {
    label: "Architecture trade-off",
    prompt:
      "Start a peer conversation about an AI, data, or software architecture trade-off relevant to my experience.",
  },
  {
    label: "Debug an incident",
    prompt:
      "Give me a realistic production incident to diagnose. Challenge my thinking one short step at a time.",
  },
  {
    label: "Tell a work story",
    prompt:
      "Ask about a technical project or difficult situation and help me make my own decisions and impact clear.",
  },
];

const STATE_LABELS: Record<RealtimeBuddyState, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  listening: "Listening",
  user_speaking: "You’re speaking",
  buddy_speaking: "Buddy is speaking",
  error: "Live unavailable",
};

export function BuddyBar({
  onStartTopic,
  onStartDaily,
  disabled,
  dashboard,
  dashboardLoading,
  realtime,
  voice,
  transcribing,
  onMicClick,
  onCancelRecording,
  delivery,
  onClearDelivery,
  autoSendVoice,
  onAutoSendVoiceChange,
  readReplies,
  onReadRepliesChange,
  onAddVocabulary,
  onPracticeVocabulary,
  onDeleteVocabulary,
}: {
  onStartTopic: (prompt: string) => void;
  onStartDaily: (topic: string, prompt: string) => void;
  disabled: boolean;
  dashboard: BuddyDashboard | null;
  dashboardLoading: boolean;
  realtime: {
    state: RealtimeBuddyState;
    error: string | null;
    isSupported: boolean;
    isActive: boolean;
    onStart: (kickoff: string) => void;
    onStop: () => void;
    onInterrupt: () => void;
  };
  voice: {
    isSupported: boolean;
    state: VoiceRecorderState;
    seconds: number;
    level: number;
    error: string | null;
    inputQuality?: "calibrating" | "good" | "quiet" | "noisy";
  };
  transcribing: boolean;
  onMicClick: () => void;
  onCancelRecording: () => void;
  delivery: DeliveryMetrics | null;
  onClearDelivery: () => void;
  autoSendVoice: boolean;
  onAutoSendVoiceChange: (value: boolean) => void;
  readReplies: boolean;
  onReadRepliesChange: (value: boolean) => void;
  onAddVocabulary: (term: string, meaning: string) => Promise<void>;
  onPracticeVocabulary: (term: VocabularyTerm) => void;
  onDeleteVocabulary: (id: number) => void;
}) {
  const [selectedTopic, setSelectedTopic] = useState(0);
  const [term, setTerm] = useState("");
  const [meaning, setMeaning] = useState("");
  const active = dashboard?.active_session;
  const targetSeconds = (active?.target_minutes ?? 10) * 60;
  const todaySeconds = dashboard?.stats.today_seconds ?? 0;
  const progress = Math.min(100, Math.round((todaySeconds / targetSeconds) * 100));
  const chosen = TOPICS[selectedTopic];

  async function addWord() {
    if (!term.trim()) return;
    await onAddVocabulary(term, meaning);
    setTerm("");
    setMeaning("");
  }

  return (
    <section
      className="shrink-0 border-b px-3 py-2.5 sm:px-4"
      style={{
        borderColor: "var(--border)",
        background:
          "linear-gradient(100deg, color-mix(in srgb, var(--primary) 8%, var(--panel)), var(--panel) 62%)",
      }}
      aria-label="Technical Buddy controls"
    >
      <div className="coach-thread-inner mx-auto min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="mr-auto min-w-[180px]">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  realtime.isActive ? "animate-pulse bg-emerald-400" : "bg-sky-400"
                }`}
                aria-hidden
              />
              <h2 className="text-sm font-semibold text-[var(--text)]">Technical Buddy</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                {STATE_LABELS[realtime.state]}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              Speak more. Think aloud. Get one useful nudge at a time.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--panel-2)] px-3 py-1.5">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Today</p>
              <p className="text-xs font-semibold text-[var(--text)]">
                {Math.floor(todaySeconds / 60)}:{String(Math.floor(todaySeconds % 60)).padStart(2, "0")} / 10:00
              </p>
            </div>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface)]">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--panel-2)] px-3 py-1.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Streak</p>
            <p className="text-xs font-semibold text-amber-300">
              {dashboardLoading ? "—" : `🔥 ${dashboard?.stats.current_streak ?? 0} days`}
            </p>
          </div>

          {!active ? (
            <button
              type="button"
              onClick={() => onStartDaily(chosen.label, chosen.prompt)}
              disabled={disabled || dashboardLoading}
              className="rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-400 disabled:opacity-40"
            >
              Start 10-minute session
            </button>
          ) : !realtime.isActive ? (
            <button
              type="button"
              onClick={() =>
                realtime.onStart(
                  `Start today's ${active.topic} session now. Open with one short question and wait for my spoken answer.`
                )
              }
              disabled={disabled || !realtime.isSupported}
              className="rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-400 disabled:opacity-40"
            >
              Start live conversation
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {realtime.state === "buddy_speaking" && (
                <button
                  type="button"
                  onClick={realtime.onInterrupt}
                  className="rounded-lg border border-amber-400/40 px-2.5 py-1.5 text-xs font-medium text-amber-300"
                >
                  Interrupt
                </button>
              )}
              <button
                type="button"
                onClick={realtime.onStop}
                className="rounded-lg border border-red-400/40 px-2.5 py-1.5 text-xs font-medium text-red-300"
              >
                End live
              </button>
            </div>
          )}
        </div>

        {(realtime.error || voice.error) && (
          <p className="mt-2 text-xs text-[var(--red)]" role="alert">
            {realtime.error || voice.error}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <select
            value={selectedTopic}
            onChange={(event) => setSelectedTopic(Number(event.target.value))}
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] outline-none"
            aria-label="Daily conversation topic"
          >
            {TOPICS.map((topic, index) => (
              <option key={topic.label} value={index}>{topic.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onStartTopic(chosen.prompt)}
            disabled={disabled}
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--panel-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text)] disabled:opacity-40"
          >
            Discuss in text
          </button>

          <details className="group">
            <summary className="cursor-pointer list-none rounded-lg border border-[var(--border-strong)] bg-[var(--panel-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
              Vocabulary · {dashboard?.vocabulary.length ?? 0}
            </summary>
            <div className="absolute z-30 mt-2 w-[min(92vw,440px)] rounded-2xl border border-[var(--border-strong)] bg-[var(--panel)] p-3 shadow-2xl">
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <input
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Word or phrase"
                  className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-2 text-xs text-[var(--text)] outline-none focus:border-sky-400/60"
                />
                <input
                  value={meaning}
                  onChange={(event) => setMeaning(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addWord();
                  }}
                  placeholder="Meaning in your words"
                  className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-2 text-xs text-[var(--text)] outline-none focus:border-sky-400/60"
                />
                <button
                  type="button"
                  onClick={() => void addWord()}
                  className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white"
                >
                  Save
                </button>
              </div>
              <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
                {dashboard?.vocabulary.length ? dashboard.vocabulary.map((word) => (
                  <div key={word.id} className="flex items-center gap-2 rounded-lg bg-[var(--panel-2)] px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[var(--text)]">{word.term}</p>
                      <p className="truncate text-[11px] text-[var(--muted)]">
                        {word.meaning || "Add a meaning by saving the term again"}
                      </p>
                    </div>
                    <span className="text-[10px] text-[var(--muted)]">×{word.times_practised}</span>
                    <button type="button" onClick={() => onPracticeVocabulary(word)} className="text-[11px] font-medium text-sky-300">Practise</button>
                    <button type="button" onClick={() => onDeleteVocabulary(word.id)} className="text-[11px] text-[var(--muted)] hover:text-red-300" aria-label={`Delete ${word.term}`}>×</button>
                  </div>
                )) : (
                  <p className="py-3 text-center text-xs text-[var(--muted)]">Save words you know but do not yet use naturally.</p>
                )}
              </div>
            </div>
          </details>

          <details className="ml-auto">
            <summary className="cursor-pointer list-none rounded-lg border border-[var(--border-strong)] bg-[var(--panel-2)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
              Record one reply
            </summary>
            <div className="absolute right-3 z-20 mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] p-3 shadow-xl">
              <VoiceControl voice={voice} transcribing={transcribing} onMicClick={onMicClick} onCancel={onCancelRecording} />
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                <input type="checkbox" checked={autoSendVoice} onChange={(event) => onAutoSendVoiceChange(event.target.checked)} className="accent-sky-400" /> Auto-send
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                <input type="checkbox" checked={readReplies} onChange={(event) => onReadRepliesChange(event.target.checked)} className="accent-sky-400" /> Read aloud
              </label>
            </div>
          </details>
        </div>

        {active && (
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Today’s focus: <span className="font-medium text-[var(--text-secondary)]">{active.topic}</span>
            <span aria-hidden> · </span>{active.goal}
          </p>
        )}

        {delivery && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-[var(--muted)]">View delivery measurements</summary>
            <div className="mt-2"><DeliveryMetricsPanel metrics={delivery} /></div>
            <button type="button" onClick={onClearDelivery} className="mt-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--text)]">Clear measurements</button>
          </details>
        )}
      </div>
    </section>
  );
}
