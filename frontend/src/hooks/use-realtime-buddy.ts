"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getToken } from "@/lib/api";

export type RealtimeBuddyState =
  | "idle"
  | "connecting"
  | "listening"
  | "user_speaking"
  | "buddy_speaking"
  | "error";

type CompletedTurn = {
  role: "user" | "assistant";
  content: string;
  durationSeconds: number;
};

export function useRealtimeBuddy({
  conversationId,
  sessionId,
  onTurn,
}: {
  conversationId: number | null;
  sessionId: number | null;
  onTurn: (turn: CompletedTurn) => void;
}) {
  const [state, setState] = useState<RealtimeBuddyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onTurnRef = useRef(onTurn);
  const assistantTextRef = useRef("");
  const speechStartedRef = useRef<number | null>(null);
  const deliveredRef = useRef(new Set<string>());

  useEffect(() => {
    onTurnRef.current = onTurn;
  }, [onTurn]);

  const cleanup = useCallback(() => {
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
    }
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    audioRef.current = null;
    assistantTextRef.current = "";
    speechStartedRef.current = null;
    deliveredRef.current.clear();
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setState("idle");
    setError(null);
  }, [cleanup]);

  useEffect(() => stop, [stop]);

  const deliver = useCallback(
    (role: "user" | "assistant", content: string, id: string, durationSeconds = 0) => {
      const text = content.trim();
      if (!text || deliveredRef.current.has(id)) return;
      deliveredRef.current.add(id);
      onTurnRef.current({ role, content: text, durationSeconds });
    },
    []
  );

  const start = useCallback(
    async (kickoff?: string) => {
      if (!conversationId || state === "connecting") return;
      cleanup();
      setState("connecting");
      setError(null);
      try {
        if (!("RTCPeerConnection" in window) || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser does not support live voice conversations.");
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
          if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
            setError("Live voice disconnected. Record one reply is still available.");
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
          if (kickoff?.trim()) {
            channel.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [{ type: "input_text", text: kickoff.trim() }],
                },
              })
            );
            channel.send(JSON.stringify({ type: "response.create" }));
          }
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
            message.event_id || message.item_id || message.response_id || type
          );
          if (type === "input_audio_buffer.speech_started") {
            speechStartedRef.current = performance.now();
            setState("user_speaking");
          } else if (type === "input_audio_buffer.speech_stopped") {
            setState("listening");
          } else if (type === "conversation.item.input_audio_transcription.completed") {
            const duration = speechStartedRef.current
              ? Math.max(0, (performance.now() - speechStartedRef.current) / 1000)
              : 0;
            speechStartedRef.current = null;
            deliver("user", String(message.transcript || ""), eventId, duration);
          } else if (
            type === "response.output_audio_transcript.delta" ||
            type === "response.audio_transcript.delta" ||
            type === "response.output_text.delta"
          ) {
            assistantTextRef.current += String(message.delta || "");
            setState("buddy_speaking");
          } else if (
            type === "response.output_audio_transcript.done" ||
            type === "response.audio_transcript.done" ||
            type === "response.output_text.done"
          ) {
            const transcript = String(message.transcript || message.text || assistantTextRef.current);
            deliver("assistant", transcript, eventId);
            assistantTextRef.current = "";
            setState("listening");
          } else if (type === "response.done") {
            if (assistantTextRef.current.trim()) {
              deliver("assistant", assistantTextRef.current, eventId);
              assistantTextRef.current = "";
            }
            setState("listening");
          } else if (type === "error") {
            setError("The live Buddy hit an error. You can stop and use Record one reply.");
          }
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const token = getToken();
        const query = new URLSearchParams({ conversation_id: String(conversationId) });
        if (sessionId) query.set("session_id", String(sessionId));
        const response = await fetch(`${api.base}/api/buddy/realtime?${query}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/sdp",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: offer.sdp,
        });
        if (!response.ok) {
          let detail = "Live conversation could not connect.";
          try {
            const data = (await response.json()) as { detail?: string };
            detail = data.detail || detail;
          } catch {
            // Keep the user-safe fallback message.
          }
          throw new Error(detail);
        }
        await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
      } catch (cause) {
        cleanup();
        setError(
          cause instanceof Error
            ? cause.message
            : "Live conversation could not connect. Record one reply is still available."
        );
        setState("error");
      }
    },
    [cleanup, conversationId, deliver, sessionId, state]
  );

  const interrupt = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(JSON.stringify({ type: "response.cancel" }));
    channel.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
    setState("listening");
  }, []);

  return {
    state,
    error,
    isSupported:
      typeof window !== "undefined" &&
      "RTCPeerConnection" in window &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    isActive: !["idle", "error"].includes(state),
    start,
    stop,
    interrupt,
  };
}
