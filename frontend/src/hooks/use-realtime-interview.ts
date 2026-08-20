"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getToken } from "@/lib/api";

const BARGE_IN_CONFIRMATION_MS = 400;

export type RealtimeInterviewState =
  | "idle"
  | "connecting"
  | "listening"
  | "candidate_speaking"
  | "interviewer_speaking"
  | "error";

export type RealtimeInterviewTurn = {
  role: "candidate" | "interviewer";
  content: string;
  requestId: string;
  durationSeconds: number;
  latencyMs?: number;
};

export function useRealtimeInterview({
  sessionId,
  onTurn,
  onEndRequested,
}: {
  sessionId: number;
  onTurn: (turn: RealtimeInterviewTurn) => Promise<void> | void;
  onEndRequested: () => Promise<void> | void;
}) {
  const [state, setState] = useState<RealtimeInterviewState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [model, setModel] = useState("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const assistantTextRef = useRef("");
  const speechStartedRef = useRef<number | null>(null);
  const responseStartedRef = useRef<number | null>(null);
  const lastLatencyRef = useRef<number | undefined>(undefined);
  const deliveredRef = useRef(new Set<string>());
  const pendingEndRef = useRef(false);
  const audioPlayingRef = useRef(false);
  const responseSpeakingRef = useRef(false);
  const userSpeechActiveRef = useRef(false);
  const bargeInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSavesRef = useRef<Promise<void>>(Promise.resolve());
  const onTurnRef = useRef(onTurn);
  const onEndRef = useRef(onEndRequested);

  useEffect(() => {
    onTurnRef.current = onTurn;
    onEndRef.current = onEndRequested;
  }, [onEndRequested, onTurn]);

  const clearBargeInTimer = useCallback(() => {
    if (bargeInTimerRef.current) clearTimeout(bargeInTimerRef.current);
    bargeInTimerRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    clearBargeInTimer();
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
    }
    peerRef.current = null;
    channelRef.current = null;
    streamRef.current = null;
    audioRef.current = null;
    assistantTextRef.current = "";
    speechStartedRef.current = null;
    responseStartedRef.current = null;
    lastLatencyRef.current = undefined;
    pendingEndRef.current = false;
    audioPlayingRef.current = false;
    responseSpeakingRef.current = false;
    userSpeechActiveRef.current = false;
    deliveredRef.current.clear();
    setCaption("");
    setIsMuted(false);
  }, [clearBargeInTimer]);

  const stop = useCallback(() => {
    cleanup();
    setState("idle");
  }, [cleanup]);

  useEffect(() => stop, [stop]);

  const deliver = useCallback((turn: RealtimeInterviewTurn) => {
    const content = turn.content.trim();
    if (!content || deliveredRef.current.has(turn.requestId)) return;
    deliveredRef.current.add(turn.requestId);
    pendingSavesRef.current = pendingSavesRef.current
      .then(() => onTurnRef.current({ ...turn, content }))
      .then(() => undefined)
      .catch(() => {
        setError("The conversation is continuing, but one transcript turn could not be saved.");
      });
  }, []);

  const sendText = useCallback(
    (text: string, record = true) => {
      const channel = channelRef.current;
      const content = text.trim();
      if (!channel || channel.readyState !== "open" || !content) return false;
      const requestId = crypto.randomUUID();
      if (record) {
        deliver({
          role: "candidate",
          content,
          requestId,
          durationSeconds: 0,
        });
      }
      responseStartedRef.current = performance.now();
      channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: content }],
          },
        })
      );
      channel.send(JSON.stringify({ type: "response.create" }));
      setState("listening");
      return true;
    },
    [deliver]
  );

  const start = useCallback(async (): Promise<boolean> => {
    if (state === "connecting") return false;
    cleanup();
    setState("connecting");
    setError(null);
    try {
      if (!("RTCPeerConnection" in window) || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support realtime voice interviews.");
      }
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("aria-hidden", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioRef.current = audio;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => undefined);
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") {
          setError("Realtime voice disconnected. You can continue in recorded-answer mode.");
          setState("error");
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => {
        setState("listening");
        responseStartedRef.current = performance.now();
        channel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Begin the interview now with a brief greeting and one concise question.",
                },
              ],
            },
          })
        );
        channel.send(JSON.stringify({ type: "response.create" }));
      };
      channel.onmessage = (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(message.type || "");
        const eventId = String(
          message.item_id || message.response_id || message.event_id || crypto.randomUUID()
        );
        if (type === "input_audio_buffer.speech_started") {
          speechStartedRef.current = performance.now();
          userSpeechActiveRef.current = true;
          clearBargeInTimer();
          if (responseSpeakingRef.current || audioPlayingRef.current) {
            bargeInTimerRef.current = setTimeout(() => {
              const activeChannel = channelRef.current;
              if (
                !userSpeechActiveRef.current ||
                (!responseSpeakingRef.current && !audioPlayingRef.current) ||
                !activeChannel ||
                activeChannel.readyState !== "open"
              ) return;
              activeChannel.send(JSON.stringify({ type: "response.cancel" }));
              activeChannel.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
              responseSpeakingRef.current = false;
              audioPlayingRef.current = false;
              setCaption("");
              setState("candidate_speaking");
            }, BARGE_IN_CONFIRMATION_MS);
          }
          setState("candidate_speaking");
        } else if (type === "input_audio_buffer.speech_stopped") {
          userSpeechActiveRef.current = false;
          clearBargeInTimer();
          responseStartedRef.current = performance.now();
          setState("listening");
        } else if (type === "conversation.item.input_audio_transcription.completed") {
          const started = speechStartedRef.current;
          const durationSeconds = started
            ? Math.max(0, (performance.now() - started) / 1000)
            : 0;
          speechStartedRef.current = null;
          deliver({
            role: "candidate",
            content: String(message.transcript || ""),
            requestId: `candidate-${eventId}`,
            durationSeconds,
          });
        } else if (
          type === "response.output_audio_transcript.delta" ||
          type === "response.audio_transcript.delta" ||
          type === "response.output_text.delta"
        ) {
          const delta = String(message.delta || "");
          if (!assistantTextRef.current && responseStartedRef.current) {
            lastLatencyRef.current = Math.round(
              performance.now() - responseStartedRef.current
            );
          }
          assistantTextRef.current += delta;
          responseSpeakingRef.current = true;
          setCaption(assistantTextRef.current);
          setState("interviewer_speaking");
        } else if (
          type === "response.output_audio_transcript.done" ||
          type === "response.audio_transcript.done" ||
          type === "response.output_text.done"
        ) {
          const transcript = String(
            message.transcript || message.text || assistantTextRef.current
          );
          deliver({
            role: "interviewer",
            content: transcript,
            requestId: `interviewer-${eventId}`,
            durationSeconds: 0,
            latencyMs: lastLatencyRef.current,
          });
          assistantTextRef.current = "";
          lastLatencyRef.current = undefined;
          setCaption("");
        } else if (type === "response.function_call_arguments.done") {
          if (String(message.name || "") === "end_interview") {
            pendingEndRef.current = true;
          }
        } else if (type === "response.output_item.done") {
          const item = (message.item || {}) as Record<string, unknown>;
          if (
            String(item.type || "") === "function_call" &&
            String(item.name || "") === "end_interview"
          ) {
            pendingEndRef.current = true;
          }
        } else if (type === "output_audio_buffer.started") {
          audioPlayingRef.current = true;
          responseSpeakingRef.current = true;
          setState("interviewer_speaking");
        } else if (type === "output_audio_buffer.stopped") {
          audioPlayingRef.current = false;
          responseSpeakingRef.current = false;
          setState("listening");
        } else if (type === "response.done") {
          if (assistantTextRef.current.trim()) {
            deliver({
              role: "interviewer",
              content: assistantTextRef.current,
              requestId: `interviewer-${eventId}`,
              durationSeconds: 0,
              latencyMs: lastLatencyRef.current,
            });
            assistantTextRef.current = "";
          }
          setCaption("");
          if (!audioPlayingRef.current) {
            responseSpeakingRef.current = false;
            setState("listening");
          }
          if (pendingEndRef.current) {
            pendingEndRef.current = false;
            void pendingSavesRef.current.then(() => onEndRef.current());
          }
        } else if (type === "error") {
          setError("The realtime interviewer hit an error. Switch to recorded-answer mode.");
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const token = getToken();
      const response = await fetch(`${api.base}/api/interview/sessions/${sessionId}/realtime`, {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: offer.sdp,
      });
      if (!response.ok) {
        let detail = "Realtime interview could not connect.";
        try {
          const data = (await response.json()) as { detail?: string };
          detail = data.detail || detail;
        } catch {
          // Keep the concise fallback message.
        }
        throw new Error(detail);
      }
      setModel(response.headers.get("X-Realtime-Model") || "OpenAI Realtime");
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
      return true;
    } catch (cause) {
      cleanup();
      setError(
        cause instanceof Error
          ? cause.message
          : "Realtime interview could not connect."
      );
      setState("error");
      return false;
    }
  }, [cleanup, clearBargeInTimer, deliver, sessionId, state]);

  const interrupt = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(JSON.stringify({ type: "response.cancel" }));
    channel.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
    clearBargeInTimer();
    responseSpeakingRef.current = false;
    audioPlayingRef.current = false;
    setCaption("");
    setState("listening");
  }, [clearBargeInTimer]);

  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  }, []);

  return {
    state,
    error,
    caption,
    model,
    isMuted,
    isSupported:
      typeof window !== "undefined" &&
      "RTCPeerConnection" in window &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    isActive: !["idle", "error"].includes(state),
    start,
    stop,
    interrupt,
    toggleMute,
    sendText,
  };
}
