"use client";

import { useCallback, useRef, useState } from "react";
import {
  getSupportedRecordingMimeType,
  MAX_RECORDING_MS,
  MIN_RECORDING_MS,
} from "@/lib/audio";

export type VoiceRecorderState = "idle" | "recording" | "processing";

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mimeRef = useRef("audio/webm");
  const startRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    maxTimerRef.current = null;
    if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
    levelRafRef.current = null;
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recorderRef.current = null;
    setLevel(0);
  }, []);

  const stopRecording = useCallback((): Promise<{ blob: Blob; duration: number; mime: string } | null> => {
    clearTimers();
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        stopTracks();
        resolve(null);
        return;
      }
      recorder.addEventListener(
        "stop",
        () => {
          const duration = (Date.now() - startRef.current) / 1000;
          const blob = new Blob(chunksRef.current, { type: mimeRef.current });
          chunksRef.current = [];
          stopTracks();
          resolve({ blob, duration, mime: mimeRef.current });
        },
        { once: true }
      );
      try {
        recorder.stop();
      } catch {
        stopTracks();
        resolve(null);
      }
    });
  }, [clearTimers, stopTracks]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported in this browser. Please type your answer.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = getSupportedRecordingMimeType();
      const recorder = new MediaRecorder(stream, { mimeType: mimeRef.current });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      startRef.current = Date.now();
      recorder.start(250);
      setState("recording");
      setSeconds(0);

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        levelRafRef.current = requestAnimationFrame(tick);
      };
      levelRafRef.current = requestAnimationFrame(tick);

      timerRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
      }, 500);

      maxTimerRef.current = setTimeout(() => {
        void stopRecording();
      }, MAX_RECORDING_MS);

      return true;
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission denied. Allow mic access or type your answer."
          : "Could not access microphone. Please type your answer instead.";
      setError(msg);
      stopTracks();
      return false;
    }
  }, [stopRecording, stopTracks]);

  const finishRecording = useCallback(async () => {
    if (state !== "recording") return null;
    const elapsed = Date.now() - startRef.current;
    if (elapsed < MIN_RECORDING_MS) {
      setError("Recording too short. Hold the mic a little longer.");
      await stopRecording();
      setState("idle");
      setSeconds(0);
      return null;
    }
    setState("processing");
    const result = await stopRecording();
    setState("idle");
    setSeconds(0);
    return result;
  }, [state, stopRecording]);

  const cancelRecording = useCallback(async () => {
    chunksRef.current = [];
    await stopRecording();
    setState("idle");
    setSeconds(0);
    setError(null);
  }, [stopRecording]);

  return {
    state,
    seconds,
    level,
    error,
    setError,
    startRecording,
    finishRecording,
    cancelRecording,
    isSupported: typeof MediaRecorder !== "undefined",
  };
}
