"use client";

import type { KeyboardEvent } from "react";
import type { DeliveryMetrics } from "@/lib/types";
import { Button } from "@/components/ui";
import { cn } from "./utils";
import { IconMic } from "./icons";
import type { VoiceRecorderState } from "@/hooks/use-voice-recorder";

export function VoiceControl({
  voice,
  transcribing,
  onMicClick,
  onCancel,
}: {
  voice: {
    isSupported: boolean;
    state: VoiceRecorderState;
    seconds: number;
    level: number;
    error: string | null;
  };
  transcribing: boolean;
  onMicClick: () => void;
  onCancel: () => void;
}) {
  if (!voice.isSupported) return null;

  const recording = voice.state === "recording";
  const processing = voice.state === "processing" || transcribing;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {recording && (
        <div className="flex items-center gap-3 rounded-full border border-red-500/30 bg-red-500/8 px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full motion-reduce:animate-none animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
          </span>
          <span className="text-xs font-medium tabular-nums text-red-300">{voice.seconds}s</span>
          <div
            className="h-2 w-20 overflow-hidden rounded-full bg-[var(--panel-3)]"
            role="meter"
            aria-valuenow={Math.round(voice.level * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Input level"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-300 transition-[width] duration-75 motion-reduce:transition-none"
              style={{ width: `${Math.round(voice.level * 100)}%` }}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onMicClick}
        disabled={processing}
        aria-label={
          processing
            ? "Transcribing audio"
            : recording
              ? "Stop recording and transcribe"
              : "Record answer with microphone"
        }
        className={cn(
          "btn-interactive inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-all motion-reduce:transition-none",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--primary)_60%,transparent)]",
          recording
            ? "border-red-500/40 bg-red-500/15 text-red-200 shadow-[0_0_24px_-6px_rgba(248,113,113,0.4)]"
            : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:border-[var(--border-strong)]",
          processing && "cursor-wait opacity-70"
        )}
      >
        <IconMic className={cn("h-4 w-4", recording && "text-red-300")} />
        {processing ? "Transcribing…" : recording ? "Stop & transcribe" : "Record answer"}
      </button>
      {recording && (
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

export function DeliveryMetricsPanel({ metrics }: { metrics: DeliveryMetrics }) {
  return (
    <div
      className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent-teal)_25%,var(--border))] bg-[color-mix(in_srgb,var(--accent-teal)_6%,var(--panel-2))] px-4 py-3"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent-teal)]">
        Delivery signals
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        <span>
          <strong className="text-[var(--text)]">{metrics.words_per_minute}</strong> wpm
        </span>
        <span>
          <strong className="text-[var(--text)]">{metrics.word_count}</strong> words
        </span>
        <span>
          <strong className="text-[var(--text)]">{metrics.filler_count}</strong> fillers (
          {metrics.filler_rate_per_100}/100)
        </span>
        {metrics.pause_count > 0 && (
          <span>
            <strong className="text-[var(--text)]">{metrics.pause_count}</strong> pause
            {metrics.pause_count === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {metrics.observations.map((o) => (
        <p key={o} className="mt-2 text-xs italic leading-relaxed text-[var(--text-secondary)]">
          {o}
        </p>
      ))}
      <p className="mt-2 text-[10px] text-[var(--muted-2)]">
        Review and edit the transcript below before submitting.
      </p>
    </div>
  );
}

export function AnswerComposer({
  answer,
  onAnswerChange,
  onSubmit,
  onKeyDown,
  disabled,
  streaming,
  voice,
  transcribing,
  deliveryMetrics,
  onMicClick,
  onCancelRecording,
}: {
  answer: string;
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  streaming?: boolean;
  voice: {
    isSupported: boolean;
    state: VoiceRecorderState;
    seconds: number;
    level: number;
    error: string | null;
  };
  transcribing: boolean;
  deliveryMetrics: DeliveryMetrics | null;
  onMicClick: () => void;
  onCancelRecording: () => void;
}) {
  return (
    <div
      className="space-y-4 rounded-[var(--radius-xl)] border bg-[var(--panel)] p-5 shadow-[var(--shadow-sm)] motion-reduce:animate-none animate-fade-up"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Your answer</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Type or record — use STAR for behavioral questions
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
        <p className="rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-200">
          {voice.error}
        </p>
      )}

      {deliveryMetrics && <DeliveryMetricsPanel metrics={deliveryMetrics} />}

      <textarea
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={6}
        placeholder="Structure your response clearly. Include context, your actions, and measurable outcomes."
        disabled={disabled || streaming}
        className="input-field w-full resize-none rounded-[var(--radius-md)] border bg-[var(--panel-2)] px-4 py-3 text-sm leading-relaxed outline-none"
        style={{ borderColor: "var(--border)" }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted-2)]">
          <kbd className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-[10px]">
            ⌘
          </kbd>{" "}
          +{" "}
          <kbd className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-[10px]">
            Enter
          </kbd>{" "}
          to submit
        </p>
        <Button
          onClick={onSubmit}
          disabled={!answer.trim() || streaming || voice.state === "recording"}
          variant="gradient"
        >
          Get feedback
        </Button>
      </div>
    </div>
  );
}

export function FollowupComposer({
  followup,
  onFollowupChange,
  onSend,
  onNext,
  onFinish,
  isLast,
  busy,
  streaming,
}: {
  followup: string;
  onFollowupChange: (v: string) => void;
  onSend: () => void;
  onNext: () => void;
  onFinish: () => void;
  isLast: boolean;
  busy: boolean;
  streaming: boolean;
}) {
  return (
    <div
      className="space-y-4 rounded-[var(--radius-xl)] border bg-[var(--panel)] p-5 shadow-[var(--shadow-sm)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <p className="text-sm font-medium">Follow-up with your coach</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Clarify, drill deeper, or request a model answer
        </p>
      </div>
      <textarea
        value={followup}
        onChange={(e) => onFollowupChange(e.target.value)}
        rows={2}
        placeholder="e.g. How could I quantify impact better on this story?"
        disabled={streaming}
        className="input-field w-full resize-none rounded-[var(--radius-md)] border bg-[var(--panel-2)] px-4 py-3 text-sm outline-none"
        style={{ borderColor: "var(--border)" }}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onSend} disabled={!followup.trim() || streaming}>
          Send follow-up
        </Button>
        {!isLast ? (
          <Button onClick={onNext} disabled={busy || streaming}>
            Next question →
          </Button>
        ) : (
          <Button onClick={onFinish} disabled={busy || streaming} variant="gradient">
            {busy ? "Summarizing…" : "Finish & get summary"}
          </Button>
        )}
      </div>
    </div>
  );
}
