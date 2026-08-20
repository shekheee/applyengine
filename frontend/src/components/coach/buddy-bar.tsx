"use client";

import type { DeliveryMetrics } from "@/lib/types";
import type { VoiceRecorderState } from "@/hooks/use-voice-recorder";
import { DeliveryMetricsPanel, VoiceControl } from "@/components/interview/answer-composer";

const TOPICS = [
  {
    label: "Explain a concept",
    prompt:
      "Be my technical buddy. Ask me to explain one concept relevant to my background in plain English, then explore one trade-off with me.",
  },
  {
    label: "Architecture trade-off",
    prompt:
      "Start a peer conversation about an AI, data, or software architecture trade-off relevant to my experience. Ask one short opening question and let me think aloud.",
  },
  {
    label: "Debug an incident",
    prompt:
      "Give me a realistic production incident to talk through with you as a colleague. Keep it conversational, challenge my diagnosis one step at a time, and help me use precise terminology.",
  },
  {
    label: "Tell a work story",
    prompt:
      "Ask me about a technical project or difficult work situation I handled. Help me tell the story naturally while making my own decisions and impact clear.",
  },
  {
    label: "Communication check-in",
    prompt:
      "Have a short technical conversation with me, then give me only the single most useful communication improvement to practise next.",
  },
];

export function BuddyBar({
  onStartTopic,
  disabled,
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
}: {
  onStartTopic: (prompt: string) => void;
  disabled: boolean;
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
}) {
  return (
    <section
      className="shrink-0 border-b px-3 py-3 sm:px-4"
      style={{
        borderColor: "var(--border)",
        background:
          "linear-gradient(90deg, color-mix(in srgb, var(--primary) 7%, var(--panel)), var(--panel))",
      }}
      aria-label="Technical Buddy controls"
    >
      <div className="coach-thread-inner mx-auto min-w-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative flex h-2.5 w-2.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
              </span>
              <h2 className="text-sm font-semibold text-[var(--text)]">Technical Buddy</h2>
              <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                Talk it through
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              A low-pressure technical conversation with occasional, focused communication nudges.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--panel-2)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={autoSendVoice}
                onChange={(event) => onAutoSendVoiceChange(event.target.checked)}
                className="accent-sky-400"
              />
              Send after speaking
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--panel-2)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={readReplies}
                onChange={(event) => onReadRepliesChange(event.target.checked)}
                className="accent-sky-400"
              />
              Read replies aloud
            </label>
            <VoiceControl
              voice={voice}
              transcribing={transcribing}
              onMicClick={onMicClick}
              onCancel={onCancelRecording}
            />
          </div>
        </div>

        {voice.error && (
          <p className="mt-2 text-xs text-[var(--red)]" role="alert">
            {voice.error}
          </p>
        )}

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Conversation starters">
          {TOPICS.map((topic) => (
            <button
              key={topic.label}
              type="button"
              onClick={() => onStartTopic(topic.prompt)}
              disabled={disabled}
              className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-sky-400/40 hover:bg-sky-400/5 hover:text-[var(--text)] disabled:opacity-40"
              style={{ borderColor: "var(--border-strong)", background: "var(--panel-2)" }}
            >
              {topic.label}
            </button>
          ))}
        </div>

        {delivery && (
          <div className="mt-3">
            <DeliveryMetricsPanel metrics={delivery} />
            <button
              type="button"
              onClick={onClearDelivery}
              className="mt-1.5 text-[11px] text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
            >
              Clear delivery measurements
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
