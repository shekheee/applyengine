"use client";

import { useCallback, useRef } from "react";

export function useInterviewerAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    audioRef.current = null;
  }, []);

  const play = useCallback(
    (blob: Blob): Promise<void> =>
      new Promise((resolve, reject) => {
        stop();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          stop();
          resolve();
        };
        audio.onerror = () => {
          stop();
          reject(new Error("Could not play interviewer audio."));
        };
        void audio.play().catch((e) => {
          stop();
          reject(e);
        });
      }),
    [stop]
  );

  return { play, stop, isSupported: typeof Audio !== "undefined" };
}
