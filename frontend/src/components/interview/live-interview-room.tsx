"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { api } from "@/lib/api";
import type { DeliveryMetrics, InterviewSession, InterviewTurn } from "@/lib/types";
import { interviewFocusLabel, curriculumTopicLabel } from "@/lib/types";
import { Button, cn } from "@/components/ui";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import type { RecordedAudio } from "@/hooks/use-voice-recorder";
import { mergeDeliveryAnalysis } from "@/lib/audio";
import { useInterviewerAudio } from "@/hooks/use-interviewer-audio";
import {
  useRealtimeInterview,
  type RealtimeInterviewTurn,
} from "@/hooks/use-realtime-interview";
import { SessionMetaBadges } from "@/components/interview/question-card";
import { DeliveryMetricsPanel } from "@/components/interview/answer-composer";

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

function speakWithBrowser(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    window.speechSynthesis.speak(utterance);
  });
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

function TranscriptLine({ turn, showDelivery }: { turn: InterviewTurn; showDelivery: boolean }) {
  const isInterviewer = turn.role === "interviewer";
  const delivery = turn.scores?.delivery as DeliveryMetrics | undefined;
  const routing = turn.scores?._routing as
    | { fallback_used?: boolean; model_served?: string; provider_served?: string }
    | undefined;
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
      {delivery && !isInterviewer && showDelivery && (
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          <p>
            {delivery.words_per_minute} wpm · {delivery.filler_count} filler word
            {delivery.filler_count === 1 ? "" : "s"} · {delivery.pause_count} pause
            {delivery.pause_count === 1 ? "" : "s"}
          </p>
          {delivery.audio_analysis?.status === "complete" && delivery.audio_analysis.summary && (
            <p className="mt-1 text-[var(--text-secondary)]">
              {delivery.audio_analysis.summary}
            </p>
          )}
        </div>
      )}
      {routing?.fallback_used && isInterviewer && (
        <p className="mt-2 text-[11px] text-amber-300/90">
          Backup model used · {routing.model_served || routing.provider_served}
        </p>
      )}
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
  const hasConversation = initialSession.turns.some(
    (turn) => turn.role === "candidate" || turn.role === "interviewer"
  );
  const initialLiveState = initialSession.live_state ?? {};
  const behaviorMode =
    initialLiveState.behavior_mode === "coach" ? "coach" : "simulation";
  const persona = String(initialLiveState.interviewer_persona || "hiring_manager");
  const [session, setSession] = useState(initialSession);
  const [roomState, setRoomState] = useState<RoomState>(
    initialSession.status === "completed"
      ? "ended"
      : hasConversation
        ? "listening"
        : "starting"
  );
  const [caption, setCaption] = useState("");
  const [textAnswer, setTextAnswer] = useState("");
  const [error, setError] = useState("");
  const [ttsFailed, setTtsFailed] = useState(false);
  const [ttsFallbackUsed, setTtsFallbackUsed] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [readinessBusy, setReadinessBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [canRetry, setCanRetry] = useState(false);
  const [captionsVisible, setCaptionsVisible] = useState(
    initialLiveState.captions !== "hidden"
  );
  const [autoEndEnabled, setAutoEndEnabled] = useState(true);
  const [legacyMode, setLegacyMode] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState<DeliveryMetrics | undefined>();

  const voice = useVoiceRecorder(processRecordedAudio, {
    autoStopSilenceMs: autoEndEnabled ? 1800 : undefined,
    minAutoStopMs: 1800,
  });
  const interviewerAudio = useInterviewerAudio();
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamedSpeechRef = useRef("");
  const queuedThroughRef = useRef(0);
  const playbackRef = useRef<Promise<void>>(Promise.resolve());
  const generationDoneRef = useRef(false);
  const requestVersionRef = useRef(0);
  const pendingTurnRef = useRef<{
    answer?: string;
    delivery?: DeliveryMetrics;
    requestId: string;
    candidateIntent?: "answer" | "clarification" | "candidate_question";
  } | null>(null);

  const saveRealtimeTurn = useCallback(
    async (turn: RealtimeInterviewTurn) => {
      const saved = await api.saveRealtimeInterviewTurn(session.id, {
        role: turn.role,
        content: turn.content,
        request_id: turn.requestId,
        duration_seconds: turn.durationSeconds,
        latency_ms: turn.latencyMs,
      });
      setSession((current) => {
        if (current.turns.some((item) => item.id === saved.id)) return current;
        return { ...current, turns: [...current.turns, saved] };
      });
    },
    [session.id]
  );

  const completeRealtimeInterview = useCallback(async () => {
    setEnding(true);
    setError("");
    try {
      const completed = await api.completeInterviewSession(
        session.id,
        selectedModel || undefined
      );
      setSession(completed);
      setRoomState("ended");
      onComplete(completed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate summary.");
    } finally {
      setEnding(false);
    }
  }, [onComplete, selectedModel, session.id]);

  const realtime = useRealtimeInterview({
    sessionId: session.id,
    onTurn: saveRealtimeTurn,
    onEndRequested: completeRealtimeInterview,
  });
  const activeRoomState: RoomState =
    realtime.isActive && !legacyMode
      ? realtime.state === "connecting"
        ? "starting"
        : realtime.state === "interviewer_speaking"
          ? "speaking"
          : "listening"
      : roomState;

  useEffect(() => {
    if (activeRoomState === "starting" || activeRoomState === "ended") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [activeRoomState]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session.turns, caption, activeRoomState]);

  const refreshSession = useCallback(async () => {
    const updated = await api.getInterviewSession(session.id);
    setSession(updated);
    onSessionUpdate(updated);
    return updated;
  }, [session.id, onSessionUpdate]);

  const enqueueInterviewerSpeech = useCallback(
    (value: string, requestVersion: number) => {
      const speech = value.trim();
      if (!speech) return;

      // Start synthesizing immediately, while the model continues generating
      // later sentences. The playback chain preserves sentence order.
      const audioRequest = api
        .liveInterviewTts(session.id, speech)
        .then((blob) => ({ blob, failed: false as const }))
        .catch(() => ({ blob: null, failed: true as const }));

      playbackRef.current = playbackRef.current.then(async () => {
        if (requestVersion !== requestVersionRef.current) return;
        const audio = await audioRequest;
        if (requestVersion !== requestVersionRef.current) return;
        if (audio.failed || !audio.blob) {
          setRoomState("speaking");
          setCaption(speech);
          const spoken = await speakWithBrowser(speech);
          setTtsFallbackUsed(spoken);
          setTtsFailed(!spoken);
          setCaption("");
          if (!generationDoneRef.current) setRoomState("thinking");
          return;
        }

        setRoomState("speaking");
        setCaption(speech);
        try {
          await interviewerAudio.play(audio.blob);
        } catch {
          setTtsFailed(true);
        } finally {
          if (requestVersion === requestVersionRef.current) {
            setCaption("");
            if (!generationDoneRef.current) setRoomState("thinking");
          }
        }
      });
    },
    [interviewerAudio, session.id]
  );

  const queueReadySentences = useCallback(
    (requestVersion: number, force = false, fallbackSpeech = "") => {
      const streamed = streamedSpeechRef.current;
      const markerIndex = streamed.indexOf(META_MARKER);
      const source = markerIndex >= 0 ? streamed.slice(0, markerIndex) : streamed;
      const usableSource = source.trim() ? source : fallbackSpeech;
      let pending = usableSource.slice(queuedThroughRef.current);

      if (force) {
        enqueueInterviewerSpeech(pending, requestVersion);
        queuedThroughRef.current = usableSource.length;
        return;
      }

      let consumed = 0;
      while (pending) {
        const sentence = pending.match(/^([\s\S]*?[.!?])(?=\s|$)/);
        if (!sentence) break;
        enqueueInterviewerSpeech(sentence[1], requestVersion);
        consumed += sentence[1].length;
        pending = pending.slice(sentence[1].length);
      }
      queuedThroughRef.current += consumed;
    },
    [enqueueInterviewerSpeech]
  );

  const requestInterviewerTurn = useCallback(
    async (
      candidateAnswer?: string,
      delivery?: DeliveryMetrics,
      existingRequestId?: string,
      candidateIntent: "answer" | "clarification" | "candidate_question" = "answer"
    ) => {
      const requestId = existingRequestId || crypto.randomUUID();
      pendingTurnRef.current = {
        answer: candidateAnswer,
        delivery,
        requestId,
        candidateIntent,
      };
      setCanRetry(false);
      const requestVersion = requestVersionRef.current + 1;
      requestVersionRef.current = requestVersion;
      setError("");
      setCaption("");
      setTtsFailed(false);
      setTtsFallbackUsed(false);
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      setRoomState("thinking");
      streamedSpeechRef.current = "";
      queuedThroughRef.current = 0;
      playbackRef.current = Promise.resolve();
      generationDoneRef.current = false;
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const result = await api.liveInterviewTurnStream(
          session.id,
          (token) => {
            streamedSpeechRef.current += token;
            queueReadySentences(requestVersion);
          },
          {
            candidate_answer: candidateAnswer,
            model: selectedModel || undefined,
            request_id: requestId,
            delivery,
            candidate_intent: candidateIntent,
            signal: abortRef.current.signal,
          }
        );
        const speech = stripMeta(result.speech);
        generationDoneRef.current = true;
        queueReadySentences(requestVersion, true, speech);
        // The server has committed the turn before this event. Refresh while
        // audio plays instead of adding a network wait after the question.
        const sessionRefresh = refreshSession();
        await playbackRef.current;
        if (requestVersion !== requestVersionRef.current) return;
        setCaption("");
        const updated = await sessionRefresh;
        setRoomState(result.end_interview ? "ended" : "listening");
        pendingTurnRef.current = null;
        setCanRetry(false);

        if (result.end_interview) {
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
          setCanRetry(true);
          setRoomState("listening");
        }
      }
    },
    [refreshSession, selectedModel, session.id, queueReadySentences, onComplete]
  );

  async function beginInterview() {
    if (readinessBusy) return;
    setReadinessBusy(true);
    setError("");
    try {
      if (!legacyMode && realtime.isSupported) {
        await realtime.start();
        return;
      }
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((track) => track.stop());
      for (let value = 3; value > 0; value -= 1) {
        setCountdown(value);
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      setCountdown(0);
      await requestInterviewerTurn();
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access is blocked. Allow it in your browser, then try again."
          : e instanceof Error
            ? e.message
            : "Could not prepare the interview room."
      );
    } finally {
      setCountdown(0);
      setReadinessBusy(false);
    }
  }

  async function submitAnswer(
    answer: string,
    delivery?: DeliveryMetrics,
    requestId?: string
  ) {
    const trimmed = answer.trim();
    if (!trimmed || activeRoomState === "thinking" || activeRoomState === "speaking" || activeRoomState === "ended") {
      return;
    }
    if (realtime.isActive && !legacyMode) {
      if (realtime.sendText(trimmed)) setTextAnswer("");
      return;
    }
    setTextAnswer("");
    setPendingDelivery(undefined);
    const intent = session.live_state?.stage === "candidate_questions"
      ? "candidate_question"
      : "answer";
    await requestInterviewerTurn(trimmed, delivery, requestId, intent);
  }

  async function processRecordedAudio(recorded: RecordedAudio | null) {
    setTranscribing(true);
    voice.setError(null);
    try {
      if (!recorded || recorded.blob.size < 100) {
        voice.setError("Recording too short. Try again.");
        return;
      }
      const result = await api.transcribeInterviewAudio(
        recorded.blob,
        recorded.mime,
        recorded.duration,
        recorded.metrics
      );
      const transcript = result.text.trim();
      if (transcript.split(/\s+/).filter(Boolean).length < 2) {
        voice.setError("I could not hear a complete answer. Please try again or type it.");
        return;
      }
      if (behaviorMode === "coach") {
        setTextAnswer(transcript);
        setPendingDelivery(result.delivery);
        void api
          .analyzeInterviewAudio(
            recorded.blob,
            recorded.mime,
            recorded.duration,
            transcript,
            recorded.metrics
          )
          .then((analysis) => {
            setPendingDelivery((current) =>
              current ? mergeDeliveryAnalysis(current, analysis) : current
            );
          })
          .catch(() => undefined);
      } else {
        const requestId = crypto.randomUUID();
        const analysisPromise = api
          .analyzeInterviewAudio(
            recorded.blob,
            recorded.mime,
            recorded.duration,
            transcript,
            recorded.metrics
          )
          .catch(() => null);
        setTranscribing(false);
        const interviewPromise = submitAnswer(transcript, result.delivery, requestId);
        void analysisPromise.then(async (analysis) => {
          if (!analysis || analysis.status !== "complete") return;
          const enriched = mergeDeliveryAnalysis(result.delivery, analysis);
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              await api.updateInterviewTurnDelivery(session.id, requestId, enriched);
              break;
            } catch {
              if (attempt < 2) {
                await new Promise((resolve) => window.setTimeout(resolve, 400));
              }
            }
          }
        });
        await interviewPromise;
      }
    } catch (e) {
      voice.setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setTranscribing(false);
    }
  }

  async function handleMicClick() {
    if (realtime.isActive && !legacyMode) {
      realtime.toggleMute();
      return;
    }
    if (activeRoomState === "speaking" || activeRoomState === "thinking" || activeRoomState === "ended") return;

    if (voice.state === "recording") {
      await processRecordedAudio(await voice.finishRecording());
      return;
    }
    if (voice.state === "processing" || transcribing) return;
    setPendingDelivery(undefined);
    if (behaviorMode === "coach") setTextAnswer("");
    await voice.startRecording();
  }

  async function repeatQuestion() {
    if (realtime.isActive && !legacyMode) {
      realtime.sendText("Please repeat the last question exactly once.", false);
      return;
    }
    const lastQuestion = [...session.turns]
      .reverse()
      .find((turn) => turn.role === "interviewer")?.content;
    if (!lastQuestion || activeRoomState !== "listening") return;
    setError("");
    setRoomState("speaking");
    if (captionsVisible) setCaption(lastQuestion);
    try {
      const blob = await api.liveInterviewTts(session.id, lastQuestion);
      await interviewerAudio.play(blob);
    } catch {
      const spoken = await speakWithBrowser(lastQuestion);
      setTtsFallbackUsed(spoken);
      setTtsFailed(!spoken);
    } finally {
      setCaption("");
      setRoomState("listening");
    }
  }

  async function askForClarification() {
    if (activeRoomState !== "listening") return;
    if (realtime.isActive && !legacyMode) {
      realtime.sendText("Please clarify or rephrase your current question briefly.", false);
      return;
    }
    setTextAnswer("");
    setPendingDelivery(undefined);
    await requestInterviewerTurn(
      "Could you clarify or rephrase that question?",
      undefined,
      undefined,
      "clarification"
    );
  }

  async function endInterviewEarly() {
    if (ending) return;
    setEnding(true);
    setError("");
    if (realtime.isActive) realtime.stop();
    requestVersionRef.current += 1;
    interviewerAudio.stop();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
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
    activeRoomState === "listening" && !ending && !transcribing && voice.state !== "processing";
  const liveCaption = realtime.isActive && !legacyMode ? realtime.caption : stripMeta(caption);
  const personaLabels: Record<string, string> = {
    hiring_manager: "Hiring manager",
    recruiter: "Recruiter screen",
    technical_panel: "Technical panel",
    skeptical_stakeholder: "Senior stakeholder",
    change_leader: "Change leader",
  };
  const stageLabel = String(session.live_state?.stage || "introduction")
    .replace(/_/g, " ");

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
            <p className="text-xs text-[var(--muted)]">
              {behaviorMode === "coach" ? "Coach mode" : "Simulation mode"} · {personaLabels[persona] ?? "Hiring manager"} · <span className="capitalize">{stageLabel}</span>
            </p>
            {realtime.isActive && !legacyMode && (
              <p className="text-xs text-emerald-300/90">
                Live WebRTC · {realtime.model || "OpenAI Realtime"} · continuous listening
              </p>
            )}
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
              disabled={ending || activeRoomState === "starting"}
            >
              {ending ? "Wrapping up…" : "End interview"}
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex justify-center lg:justify-start">
            <InterviewerAvatar state={activeRoomState} />
          </div>

          <div className="min-w-0 space-y-4">
            {activeRoomState === "speaking" && liveCaption && captionsVisible && (
              <div
                className="rounded-[var(--radius-md)] border border-[var(--primary)]/25 bg-[var(--primary)]/5 px-4 py-3"
                aria-live="polite"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-2)]">
                  Interviewer speaking
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text)]">{liveCaption}</p>
              </div>
            )}

            {ttsFailed && activeRoomState === "listening" && (
              <p className="text-xs text-amber-300/90">
                Audio unavailable — read the transcript below. Text answers still work.
              </p>
            )}

            {ttsFallbackUsed && activeRoomState === "listening" && (
              <p className="text-xs text-amber-300/90">
                Cloud voice was unavailable, so the browser voice completed this turn.
              </p>
            )}

            <div
              ref={scrollRef}
              className="max-h-[min(340px,45vh)] min-h-[160px] space-y-3 overflow-y-auto overflow-x-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel-2)]/40 p-3 sm:p-4"
              aria-label="Interview transcript"
            >
              {session.turns.filter((t) => t.role === "interviewer" || t.role === "candidate").length === 0 &&
                !liveCaption && !realtime.isActive && (
                  <div className="mx-auto max-w-md py-5 text-center">
                    <p className="text-sm font-medium text-[var(--text)]">Ready for a realistic interview?</p>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                      Realtime voice detects when you finish speaking. Use the Interrupt button to stop the interviewer mid-turn.
                    </p>
                    <Button
                      className="mt-4"
                      variant="gradient"
                      size="sm"
                      onClick={() => void beginInterview()}
                      disabled={readinessBusy}
                    >
                      {countdown > 0
                        ? `Starting in ${countdown}…`
                        : readinessBusy
                          ? "Connecting…"
                          : legacyMode
                            ? "Start recorded-answer mode"
                            : "Start realtime interview"}
                    </Button>
                  </div>
                )}
              {session.turns
                .filter((t) => t.role === "interviewer" || t.role === "candidate")
                .map((t) => (
                  <TranscriptLine
                    key={t.id}
                    turn={t}
                    showDelivery={behaviorMode === "coach"}
                  />
                ))}
            </div>

            {error && (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <p className="text-sm text-red-300">{error}</p>
                {canRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const pending = pendingTurnRef.current;
                      if (pending) void requestInterviewerTurn(
                        pending.answer,
                        pending.delivery,
                        pending.requestId,
                        pending.candidateIntent
                      );
                    }}
                  >
                    Retry safely
                  </Button>
                )}
              </div>
            )}

            {realtime.error && !legacyMode && (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <p className="text-sm text-amber-300/90">{realtime.error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    realtime.stop();
                    setLegacyMode(true);
                    setRoomState("starting");
                    setError("");
                  }}
                >
                  Use recorded-answer mode
                </Button>
              </div>
            )}

            {voice.error && (
              <p className="text-sm text-amber-300/90" role="alert">
                {voice.error}
              </p>
            )}

            {activeRoomState === "ended" ? (
              <p className="text-sm text-[var(--muted)]">
                Interview complete — review your summary below.
              </p>
            ) : (
              <div className="space-y-3 border-t border-[var(--border)] pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => void repeatQuestion()} disabled={!canRespond}>
                    Repeat question
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void askForClarification()} disabled={!canRespond}>
                    Clarify
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCaptionsVisible((value) => !value)}>
                    {captionsVisible ? "Hide captions" : "Show captions"}
                  </Button>
                  {realtime.isActive && !legacyMode ? (
                    activeRoomState === "speaking" && (
                      <Button variant="ghost" size="sm" onClick={realtime.interrupt}>
                        Interrupt
                      </Button>
                    )
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setAutoEndEnabled((value) => !value)}>
                      Auto-end {autoEndEnabled ? "on" : "off"}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {canRespond
                    ? realtime.isActive && !legacyMode
                      ? realtime.isMuted
                        ? "Microphone muted. Unmute to continue, or type an answer."
                        : "The interviewer is listening continuously. Speak naturally or type an answer."
                      : "Speak your answer or type below. Press the mic again when finished, or ⌘/Ctrl+Enter to send text."
                    : activeRoomState === "speaking"
                      ? realtime.isActive && !legacyMode
                        ? "Listen, or use Interrupt to stop this turn."
                        : "Listen to the interviewer…"
                      : activeRoomState === "thinking"
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
                      realtime.isActive && !legacyMode
                        ? realtime.isMuted
                          ? "border-amber-400/60 bg-amber-500/15 text-amber-200"
                          : "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                        : voice.state === "recording"
                        ? "border-red-400/60 bg-red-500/15 text-red-200 motion-safe:animate-pulse motion-reduce:animate-none"
                        : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--text)] hover:border-[var(--primary)]/40 disabled:opacity-40"
                    )}
                    aria-label={
                      realtime.isActive && !legacyMode
                        ? realtime.isMuted
                          ? "Unmute microphone"
                          : "Mute microphone"
                        : voice.state === "recording"
                          ? "Stop recording"
                          : "Start recording answer"
                    }
                  >
                    {realtime.isActive && !legacyMode
                      ? realtime.isMuted
                        ? "🔇"
                        : "🎙"
                      : transcribing || voice.state === "processing"
                        ? "…"
                        : "🎤"}
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
                    onClick={() => void submitAnswer(textAnswer, pendingDelivery)}
                    disabled={!canRespond || !textAnswer.trim()}
                    variant="gradient"
                    size="sm"
                  >
                    Send
                  </Button>
                </div>
                {voice.state === "recording" && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-300/90">
                    <span>
                      Recording… {autoEndEnabled ? "auto-stops after a natural pause" : "tap mic when finished"} ({voice.seconds}s)
                    </span>
                    {autoEndEnabled && (
                      <button type="button" className="underline underline-offset-2" onClick={voice.keepListening}>
                        I’m still thinking
                      </button>
                    )}
                    <span className="text-[var(--muted)]">
                      {voice.inputQuality === "calibrating"
                        ? "Calibrating mic…"
                        : voice.inputQuality === "good"
                          ? "Mic clear"
                          : voice.inputQuality === "quiet"
                            ? "Move closer"
                            : "Background noise"}
                    </span>
                  </div>
                )}
                {behaviorMode === "coach" && pendingDelivery && textAnswer.trim() && (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--primary-2)]">
                      Review the transcript before sending. Editing it will not change the recorded delivery measurements.
                    </p>
                    <DeliveryMetricsPanel metrics={pendingDelivery} />
                  </div>
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
