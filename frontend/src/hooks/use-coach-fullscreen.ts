"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "applyengine_coach_fullscreen";

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function useCoachFullscreen(enabled = true) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (enabled) setFullscreen(readStored());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const root = document.documentElement;
    if (fullscreen) {
      root.classList.add("coach-fullscreen");
      document.body.style.overflow = "hidden";
    } else {
      root.classList.remove("coach-fullscreen");
      document.body.style.overflow = "";
    }
    window.localStorage.setItem(STORAGE_KEY, fullscreen ? "1" : "0");

    return () => {
      root.classList.remove("coach-fullscreen");
      document.body.style.overflow = "";
    };
  }, [enabled, fullscreen]);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((v) => !v);
  }, []);

  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing =
        tag === "TEXTAREA" ||
        tag === "INPUT" ||
        (e.target as HTMLElement)?.isContentEditable;

      if (e.key === "Escape" && fullscreen) {
        e.preventDefault();
        exitFullscreen();
        return;
      }

      if (e.key === "f" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
        e.preventDefault();
        toggleFullscreen();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, fullscreen, exitFullscreen, toggleFullscreen]);

  return { fullscreen, toggleFullscreen, exitFullscreen, setFullscreen };
}
