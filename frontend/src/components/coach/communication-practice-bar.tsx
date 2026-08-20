"use client";

import type { DeliveryMetrics } from "@/lib/types";
import type { VoiceRecorderState } from "@/hooks/use-voice-recorder";
import { DeliveryMetricsPanel, VoiceControl } from "@/components/interview/answer-composer";

const DRILLS = [
  {
    label: "30-second update",
    prompt:
      "Give me one realistic workplace update to answer in 30 seconds. Assess my Point → Impact → Action structure and make me retry.",
  },
  {
    label: "Incident update",
    prompt:
      "Give me a realistic incident scenario such as stale or blocked runs. Ask me to explain it first to an engineer, then to a senior business stakeholder.",
  },
  {
    label: "Stop repetition",
    prompt:
      "Give me a concise interview question. Detect when I repeat the same idea in different words, then make me answer it again in half the time.",
  },
  {
    label: "Own the outcome",
    prompt:
      "Give me a competency question that tests my individual contribution. Challenge vague use of ‘we’ and help me make my actions and impact explicit.",
  },
  {
    label: "Sharper vocabulary",
    prompt:
      "Give me a technical or business scenario based on my background. Help me replace vague wording with precise domain language without adding empty jargon.",
  },
];

export function CommunicationPracticeBar({
  onStartDrill,
  disabled,
  voice,
  transcribing,
  onMicClick,
  onCancelRecording,
  delivery,
  onClearDelivery,
}: {
  onStartDrill: (prompt: string) => void;
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
}) {
  return (
    <section
      className="shrink-0 border-b px-3 py-3 sm:px-4"
      style={{ borderColor: "var(--border)", background: "var(--panel)" }}
      aria-label="Communication Gym controls"
    >
      <div className="coach-thread-inner mx-auto min-w-0">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
              <h2 className="text-sm font-semibold text-[var(--text)]">Communication Gym</h2>
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                Voice-first
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              Practise the answer, get a precise diagnosis, then retry it shorter and clearer.
            </p>
          </div>
          <VoiceControl
            voice={voice}
            transcribing={transcribing}
            onMicClick={onMicClick}
            onCancel={onCancelRecording}
          />
        </div>

        {voice.error && (
          <p className="mt-2 text-xs text-[var(--red)]" role="alert">
            {voice.error}
          </p>
        )}

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Practice drills">
          {DRILLS.map((drill) => (
            <button
              key={drill.label}
              type="button"
              onClick={() => onStartDrill(drill.prompt)}
              disabled={disabled}
              className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/5 hover:text-[var(--text)] disabled:opacity-40"
              style={{ borderColor: "var(--border-strong)", background: "var(--panel-2)" }}
            >
              {drill.label}
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
