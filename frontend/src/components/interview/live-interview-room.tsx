"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { api } from "@/lib/api";
import type { InterviewSession, InterviewTurn } from "@/lib/types";
import { interviewFocusLabel, curriculumTopicLabel } from "@/lib/types";
import { Button, cn } from "@/components/ui";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useInterviewerAudio } from "@/hooks/use-interviewer-audio";
import { SessionMetaBadges } from "@/components/interview/question-card";

type RoomState = "starting" | "speaking" | "listening" | "thinking" | "ended";

const META_MARKER = "|||META|||";

function stripMeta(raw: string): string {
  const idx = raw.indexOf(META_MARKER);
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim();
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function InterviewerAvatar({ state }: { state: RoomState }) {
  const pulse =
    state === "speaking" || state === "listening" || state === "thinking";
  const label =
    state === "speaking"
      ? "Speaking"
      : state === "listening"
        ? "Listening"
        : state === "thinking"
          ? "Thinking"
          : state === "starting"
            ? "Connecting"
            : "Interview ended";

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          "relative grid h-20 w-20 place-items-center rounded-full border-2 bg-[var(--panel-2)] shadow-[0_0_40px_-8px_var(--glow-soft)]",
          state === "speaking" && "border-[var(--primary)]",
          state === "listening" && "border-emerald-400/70",
          state === "thinking" && "border-amber-400/60",
          state === "ended" && "border-[var(--border)] opacity-60"
        )}
        aria-hidden
      >
        {pulse && (
          <span
            className={cn(
              "absolute inset-0 rounded-full motion-safe:animate-ping motion-reduce:animate-none",
              state === "speaking" && "bg-[var(--primary)]/20",
              state === "listening" && "bg-emerald-400/15",
              state === "thinking" && "bg-amber-400/15"
            )}
          />
        )}
        <span className="relative text-2xl font-semibold text-[var(--primary-2)]">I</span>
      </div>
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
    </div>
  );
}

function TranscriptLine({ turn }: { turn: InterviewTurn }) {
  const isInterviewer = turn.role === "interviewer";
  return (
    <div
      className={cn(
        "max-w-[92%] rounded-[var(--radius-md)] px-3 py-2 text-sm leading-relaxed",
        isInterviewer
          ? "mr-auto border border-[var(--border)] bg-[var(--panel-2)]/80 text-[var(--text)]"
          : "ml-auto border border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--text)]"
      )}
    >
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {isInterviewer ? "Interviewer" : "You"}
      </p>
      <p>{turn.content}</p>
    </div>
  );
}

export function LiveInterviewRoom({
  session: initialSession,
  selectedModel,
  companyLabel,
  onSessionUpdate,
  onComplete,
  onExit,
  embedded = false,
}: {
  session: InterviewSession;
  selectedModel: string;
  companyLabel?: string;
  onSessionUpdate: (s: InterviewSession) => void;
  onComplete: (s: InterviewSession) => void;
  onExit: () => void;
  embedded?: boolean;
}) {
  const [session, setSession] = useState(initialSession);
  const [roomState, setRoomState] = useState<RoomState>("starting");
  const [caption, setCaption] = useState("");
  const [textAnswer, setTextAnswer] = useState("");
  const [error, setError] = useState("");
  const [ttsFailed, setTtsFailed] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);

  const voice = useVoiceRecorder();
  const interviewerAudio = useInterviewerAudio();
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session.turns, caption, roomState]);

  const refreshSession = useCallback(async () => {
    const updated = await api.getInterviewSession(session.id);
    setSession(updated);
    onSessionUpdate(updated);
    return updated;
  }, [session.id, onSessionUpdate]);

  const speakInterviewerLine = useCallback(
    async (speech: string) => {
      setRoomState("speaking");
      setTtsFailed(false);
      try {
        const blob = await api.liveInterviewTts(session.id, speech);
        await interviewerAudio.play(blob);
      } catch {
        setTtsFailed(true);
      }
      setRoomState("listening");
    },
    [interviewerAudio, session.id]
  );

  const requestInterviewerTurn = useCallback(
    async (candidateAnswer?: string) => {
      setError("");
      setCaption("");
      setRoomState("thinking");
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const result = await api.liveInterviewTurnStream(
          session.id,
          (token) => setCaption((prev) => prev + token),
          {
            candidate_answer: candidateAnswer,
            model: selectedModel || undefined,
            signal: abortRef.current.signal,
          }
        );
        const speech = stripMeta(result.speech);
        setCaption("");
        const updated = await refreshSession();
        await speakInterviewerLine(speech);

        if (result.end_interview) {
          setRoomState("ended");
          setEnding(true);
          try {
            const completed = await api.completeInterviewSession(
              updated.id,
              selectedModel || undefined
            );
            setSession(completed);
            onComplete(completed);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not generate summary.");
          } finally {
            setEnding(false);
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : "Interviewer turn failed.");
          setRoomState("listening");
        }
      }
    },
    [refreshSession, selectedModel, session.id, speakInterviewerLine, onComplete]
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void requestInterviewerTurn();
  }, [requestInterviewerTurn]);

  async function submitAnswer(answer: string) {
    const trimmed = answer.trim();
    if (!trimmed || roomState === "thinking" || roomState === "speaking" || roomState === "ended") {
      return;
    }
    setTextAnswer("");
    await requestInterviewerTurn(trimmed);
  }

  async function handleMicClick() {
    if (roomState === "speaking" || roomState === "thinking" || roomState === "ended") return;

    if (voice.state === "recording") {
      setTranscribing(true);
      voice.setError(null);
      try {
        const recorded = await voice.finishRecording();
        if (!recorded || recorded.blob.size < 100) {
          voice.setError("Recording too short. Try again.");
          return;
        }
        const result = await api.transcribeInterviewAudio(
          recorded.blob,
          recorded.mime,
          recorded.duration
        );
        await submitAnswer(result.text);
      } catch (e) {
        voice.setError(e instanceof Error ? e.message : "Transcription failed.");
      } finally {
        setTranscribing(false);
      }
      return;
    }
    if (voice.state === "processing" || transcribing) return;
    await voice.startRecording();
  }

  async function endInterviewEarly() {
    if (ending) return;
    setEnding(true);
    setError("");
    interviewerAudio.stop();
    abortRef.current?.abort();
    try {
      const completed = await api.completeInterviewSession(
        session.id,
        selectedModel || undefined
      );
      setSession(completed);
      setRoomState("ended");
      onComplete(completed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end interview.");
    } finally {
      setEnding(false);
    }
  }

  function onTextKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submitAnswer(textAnswer);
    }
  }

  const canRespond =
    roomState === "listening" && !ending && !transcribing && voice.state !== "processing";
  const liveCaption = stripMeta(caption);

  return (
    <div className="min-w-0 space-y-4">
      <div
        className={cn(
          "overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--panel)]/60",
          embedded ? "p-4 sm:p-5" : "p-5 sm:p-8"
        )}
        style={{ borderColor: "var(--border-strong)" }}
      >
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary-2)]">
              Live interview
            </p>
            <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
              Interview room
            </h2>
            <SessionMetaBadges
              difficulty={session.difficulty}
              company={companyLabel}
            />
            {session.curriculum_topic ? (
              <p className="text-xs text-[var(--muted)]">
                {curriculumTopicLabel(session.curriculum_topic)} ·{" "}
                {interviewFocusLabel(session.focus)}
              </p>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                {interviewFocusLabel(session.focus)} practice
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span
              className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 font-mono text-sm tabular-nums text-[var(--muted)]"
              aria-live="polite"
            >
              {formatElapsed(elapsed)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void endInterviewEarly()}
              disabled={ending || roomState === "starting"}
            >
              {ending ? "Wrapping up…" : "End interview"}
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex justify-center lg:justify-start">
            <InterviewerAvatar state={roomState} />
          </div>

          <div className="min-w-0 space-y-4">
            {(roomState === "speaking" || roomState === "thinking") && liveCaption && (
              <div
                className="rounded-[var(--radius-md)] border border-[var(--primary)]/25 bg-[var(--primary)]/5 px-4 py-3"
                aria-live="polite"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-2)]">
                  Interviewer {roomState === "thinking" ? "typing" : "speaking"}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text)]">{liveCaption}</p>
              </div>
            )}

            {ttsFailed && roomState === "listening" && (
              <p className="text-xs text-amber-300/90">
                Audio unavailable — read the transcript below. Text answers still work.
              </p>
            )}

            <div
              ref={scrollRef}
              className="max-h-[min(340px,45vh)] min-h-[160px] space-y-3 overflow-y-auto overflow-x-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-2)]/40 p-3 sm:p-4"
              aria-label="Interview transcript"
            >
              {session.turns.filter((t) => t.role === "interviewer" || t.role === "candidate").length === 0 &&
                !liveCaption && (
                  <p className="text-sm text-[var(--muted)]">Your interview will appear here…</p>
                )}
              {session.turns
                .filter((t) => t.role === "interviewer" || t.role === "candidate")
                .map((t) => (
                  <TranscriptLine key={t.id} turn={t} />
                ))}
            </div>

            {error && (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            )}

            {voice.error && (
              <p className="text-sm text-amber-300/90" role="alert">
                {voice.error}
              </p>
            )}

            {roomState === "ended" ? (
              <p className="text-sm text-[var(--muted)]">
                Interview complete — review your summary below.
              </p>
            ) : (
              <div className="space-y-3 border-t border-[var(--border)] pt-4">
                <p className="text-xs text-[var(--muted)]">
                  {canRespond
                    ? "Speak your answer or type below. Press the mic again when finished, or ⌘/Ctrl+Enter to send text."
                    : roomState === "speaking"
                      ? "Listen to the interviewer…"
                      : roomState === "thinking"
                        ? "Interviewer is preparing the next question…"
                        : "Connecting to your interviewer…"}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleMicClick()}
                    disabled={!canRespond && voice.state !== "recording"}
                    className={cn(
                      "grid h-12 w-12 shrink-0 place-items-center rounded-full border transition-colors motion-reduce:transition-none",
                      voice.state === "recording"
                        ? "border-red-400/60 bg-red-500/15 text-red-200 motion-safe:animate-pulse motion-reduce:animate-none"
                        : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:border-[var(--primary)]/40 disabled:opacity-40"
                    )}
                    aria-label={
                      voice.state === "recording" ? "Stop recording" : "Start recording answer"
                    }
                  >
                    {transcribing || voice.state === "processing" ? "…" : "🎤"}
                  </button>
                  <textarea
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    onKeyDown={onTextKeyDown}
                    disabled={!canRespond}
                    placeholder="Type your answer (accessibility fallback)…"
                    rows={2}
                    className="min-h-[48px] min-w-0 flex-1 resize-y rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] disabled:opacity-50"
                  />
                  <Button
                    onClick={() => void submitAnswer(textAnswer)}
                    disabled={!canRespond || !textAnswer.trim()}
                    variant="gradient"
                    size="sm"
                  >
                    Send
                  </Button>
                </div>
                {voice.state === "recording" && (
                  <p className="text-xs text-emerald-300/90">
                    Recording… tap mic again when finished ({voice.seconds}s)
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onExit}>
          Back to setup
        </Button>
      </div>
    </div>
  );
}
