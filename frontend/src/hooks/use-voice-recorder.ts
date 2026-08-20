"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSupportedRecordingMimeType,
  MAX_RECORDING_MS,
  MIN_RECORDING_MS,
} from "@/lib/audio";
import type { ClientAudioMetrics } from "@/lib/types";

export type VoiceRecorderState = "idle" | "recording" | "processing";
export type InputQuality = "calibrating" | "good" | "quiet" | "noisy";
export type RecordedAudio = {
  blob: Blob;
  duration: number;
  mime: string;
  metrics: ClientAudioMetrics;
};
export type VoiceRecorderOptions = {
  autoStopSilenceMs?: number;
  minAutoStopMs?: number;
};

export function useVoiceRecorder(
  onAutoComplete?: (recording: RecordedAudio) => void | Promise<void>,
  options: VoiceRecorderOptions = {}
) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [inputQuality, setInputQuality] = useState<InputQuality>("calibrating");
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
  const onAutoCompleteRef = useRef(onAutoComplete);
  const optionsRef = useRef(options);
  const lastSoundRef = useRef(0);
  const heardSpeechRef = useRef(false);
  const autoFinishingRef = useRef(false);
  const noiseFloorRef = useRef(0.01);
  const levelTotalRef = useRef(0);
  const levelPeakRef = useRef(0);
  const sampleCountRef = useRef(0);
  const voicedFramesRef = useRef(0);
  const silentFramesRef = useRef(0);
  const pauseStartedRef = useRef<number | null>(null);
  const pausesRef = useRef<Array<{ duration_ms: number }>>([]);
  const calibrationUntilRef = useRef(0);

  useEffect(() => {
    onAutoCompleteRef.current = onAutoComplete;
  }, [onAutoComplete]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

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

  const stopRecording = useCallback((): Promise<RecordedAudio | null> => {
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
          const samples = Math.max(1, sampleCountRef.current);
          const meanLevel = levelTotalRef.current / samples;
          const noiseLevel = noiseFloorRef.current * 4;
          const quality: Exclude<InputQuality, "calibrating"> =
            levelPeakRef.current < 0.12 || meanLevel < 0.025
              ? "quiet"
              : noiseLevel > 0.1
                ? "noisy"
                : "good";
          const metrics: ClientAudioMetrics = {
            input_quality: quality,
            noise_floor: Number(noiseLevel.toFixed(3)),
            mean_level: Number(meanLevel.toFixed(3)),
            peak_level: Number(levelPeakRef.current.toFixed(3)),
            silence_ratio: Number((silentFramesRef.current / samples).toFixed(3)),
            voiced_ratio: Number((voicedFramesRef.current / samples).toFixed(3)),
            pauses: pausesRef.current.slice(0, 12),
          };
          chunksRef.current = [];
          setInputQuality(quality);
          stopTracks();
          resolve({ blob, duration, mime: mimeRef.current, metrics });
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

  const finishAutomatically = useCallback(async () => {
    if (autoFinishingRef.current) return;
    autoFinishingRef.current = true;
    setState("processing");
    const recording = await stopRecording();
    setState("idle");
    setSeconds(0);
    autoFinishingRef.current = false;
    if (recording && onAutoCompleteRef.current) {
      await onAutoCompleteRef.current(recording);
    } else if (recording) {
      setError("Recording stopped automatically. Please record a shorter answer.");
    }
  }, [stopRecording]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported in this browser. Please type your answer.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      mimeRef.current = getSupportedRecordingMimeType();
      const recorder = new MediaRecorder(stream, {
        mimeType: mimeRef.current,
        audioBitsPerSecond: 48_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      startRef.current = Date.now();
      lastSoundRef.current = Date.now();
      heardSpeechRef.current = false;
      autoFinishingRef.current = false;
      noiseFloorRef.current = 0.01;
      levelTotalRef.current = 0;
      levelPeakRef.current = 0;
      sampleCountRef.current = 0;
      voicedFramesRef.current = 0;
      silentFramesRef.current = 0;
      pauseStartedRef.current = null;
      pausesRef.current = [];
      calibrationUntilRef.current = Date.now() + 650;
      recorder.start(250);
      setState("recording");
      setSeconds(0);
      setInputQuality("calibrating");

      const ctx = new AudioContext({ latencyHint: "interactive" });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
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
        const rms = Math.sqrt(sum / data.length);
        const currentLevel = Math.min(1, rms * 4);
        const now = Date.now();
        sampleCountRef.current += 1;
        levelTotalRef.current += currentLevel;
        levelPeakRef.current = Math.max(levelPeakRef.current, currentLevel);
        if (now <= calibrationUntilRef.current) {
          noiseFloorRef.current = Math.min(0.08, noiseFloorRef.current * 0.85 + rms * 0.15);
        }
        const soundThreshold = Math.max(0.016, noiseFloorRef.current * 2.6);
        const hasSound = rms >= soundThreshold;
        if (!hasSound && !heardSpeechRef.current) {
          noiseFloorRef.current = Math.min(0.08, noiseFloorRef.current * 0.98 + rms * 0.02);
        }
        setLevel(currentLevel);
        if (hasSound) {
          voicedFramesRef.current += 1;
          if (pauseStartedRef.current != null && heardSpeechRef.current) {
            const pauseDuration = now - pauseStartedRef.current;
            if (pauseDuration >= 350) pausesRef.current.push({ duration_ms: pauseDuration });
          }
          pauseStartedRef.current = null;
          heardSpeechRef.current = true;
          lastSoundRef.current = now;
        } else {
          silentFramesRef.current += 1;
          if (heardSpeechRef.current && pauseStartedRef.current == null) {
            pauseStartedRef.current = now;
          }
        }
        if (sampleCountRef.current % 15 === 0 && now > calibrationUntilRef.current) {
          const runningMean = levelTotalRef.current / sampleCountRef.current;
          setInputQuality(
            levelPeakRef.current < 0.12 || runningMean < 0.025
              ? "quiet"
              : noiseFloorRef.current * 4 > 0.1
                ? "noisy"
                : "good"
          );
        }
        const silenceMs = optionsRef.current.autoStopSilenceMs;
        const minimumMs = optionsRef.current.minAutoStopMs ?? 4000;
        if (
          silenceMs &&
          heardSpeechRef.current &&
          now - startRef.current >= minimumMs &&
          now - lastSoundRef.current >= silenceMs
        ) {
          void finishAutomatically();
          return;
        }
        levelRafRef.current = requestAnimationFrame(tick);
      };
      levelRafRef.current = requestAnimationFrame(tick);

      timerRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
      }, 500);

      maxTimerRef.current = setTimeout(() => {
        void finishAutomatically();
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
  }, [finishAutomatically, stopTracks]);

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

  const keepListening = useCallback(() => {
    heardSpeechRef.current = true;
    lastSoundRef.current = Date.now();
  }, []);

  return {
    state,
    seconds,
    level,
    inputQuality,
    error,
    setError,
    startRecording,
    finishRecording,
    cancelRecording,
    keepListening,
    isSupported: typeof MediaRecorder !== "undefined",
  };
}
