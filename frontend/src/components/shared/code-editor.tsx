"use client";

import Editor, { type EditorProps } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { cn } from "@/components/ui";

/**
 * Every completion surface is off: no inline (ghost-text) suggestions, no
 * suggest popup while typing, no word or snippet completions. Practice code
 * must be the user's own.
 */
export const NO_ASSIST_EDITOR_OPTIONS: NonNullable<EditorProps["options"]> = {
  inlineSuggest: { enabled: false },
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: "off",
  snippetSuggestions: "none",
  parameterHints: { enabled: false },
  acceptSuggestionOnEnter: "off",
  tabCompletion: "off",
  inlayHints: { enabled: "off" },
  minimap: { enabled: false },
  fontSize: 13,
  tabSize: 4,
  scrollBeyondLastLine: false,
  automaticLayout: true,
};

const AUTOSAVE_MS = 5000;

export function loadDraft(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

/** Monaco editor with AI assistance off. Autosaves to `draftKey` every 5 s. */
export function CodeEditor({
  value,
  onChange,
  language = "python",
  readOnly = false,
  draftKey,
  height = 360,
}: {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  draftKey?: string;
  height?: number | string;
}) {
  const latest = useRef(value);
  const saved = useRef(value);
  const box = useRef<HTMLDivElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  useEffect(() => {
    if (!draftKey || readOnly) return;
    const timer = window.setInterval(() => {
      if (latest.current === saved.current) return;
      try {
        window.localStorage.setItem(draftKey, latest.current);
        saved.current = latest.current;
      } catch {
        // Quota or privacy mode; the in-memory value is still intact.
      }
    }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [draftKey, readOnly]);

  return (
    <div
      ref={box}
      className={cn("overflow-hidden rounded-[var(--radius-md)] border", height === "100%" && "h-full")}
      style={{ borderColor: "var(--border)" }}
    >
      <Editor
        height={height}
        language={language}
        theme="vs-dark"
        value={value}
        onChange={(next) => onChange(next ?? "")}
        options={{ ...NO_ASSIST_EDITOR_OPTIONS, readOnly }}
        onMount={(editor) => {
          // Monaco can mount while its container is still hidden (0-5px tall) and
          // then never re-measure; lay out again whenever the container resizes.
          const relayout = () => {
            const node = editor.getContainerDomNode();
            editor.layout({ width: node.clientWidth, height: node.clientHeight });
          };
          observer.current?.disconnect();
          observer.current = new ResizeObserver(relayout);
          const node = editor.getContainerDomNode();
          observer.current.observe(node);
          if (node.parentElement) observer.current.observe(node.parentElement);
          if (box.current) observer.current.observe(box.current);
          // The wrapper un-hides itself after mount without always resizing; re-check briefly.
          for (const delay of [0, 50, 250, 1000]) window.setTimeout(relayout, delay);
        }}
        loading={<div className="p-4 text-sm text-[var(--muted)]">Loading editor…</div>}
      />
    </div>
  );
}
