"use client";

import {
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { CoachModel, PendingAttachment } from "@/lib/types";
import { ModelSelector } from "@/components/model-selector";
import { AttachIcon, SendIcon } from "@/components/coach/coach-icons";

const ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,.pdf,.txt,.md,.docx,application/pdf";

export function CoachComposer({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  onStop,
  streaming,
  savingEdit,
  pendingFiles,
  onAddFiles,
  onRemovePending,
  models,
  selectedModel,
  onModelChange,
  textareaRef,
}: {
  input: string;
  onInputChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  savingEdit: boolean;
  pendingFiles: PendingAttachment[];
  onAddFiles: (files: FileList | null) => void;
  onRemovePending: (idx: number) => void;
  models: CoachModel[];
  selectedModel: string;
  onModelChange: (id: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = Boolean(input.trim() || pendingFiles.length);

  return (
    <div className="coach-composer shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
      <div
        className="coach-composer-shell mx-auto w-full min-w-0 max-w-[680px] overflow-hidden rounded-2xl border transition-shadow focus-within:shadow-[0_0_0_3px_var(--glow-soft)]"
        style={{
          borderColor: "var(--border-strong)",
          background: "var(--panel-2)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        {pendingFiles.length > 0 && (
          <div
            className="flex flex-wrap gap-2 border-b px-3 py-2"
            style={{ borderColor: "var(--border)" }}
          >
            {pendingFiles.map((p, i) => (
              <div
                key={`${p.file.name}-${i}`}
                className="relative flex max-w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-xs"
                style={{
                  borderColor: "var(--border-strong)",
                  background: "var(--panel)",
                }}
              >
                {p.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.preview}
                    alt={p.file.name}
                    className="h-8 w-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="shrink-0 text-[var(--muted)]" aria-hidden>
                    📄
                  </span>
                )}
                <span className="max-w-[140px] truncate text-[var(--text-secondary)]">
                  {p.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePending(i)}
                  aria-label={`Remove ${p.file.name}`}
                  className="shrink-0 rounded p-0.5 text-[var(--muted)] transition-colors hover:text-[var(--red)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                  style={{ outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)" }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1 p-2 sm:gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              onAddFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={streaming || savingEdit}
            title="Attach file"
            aria-label="Attach file"
            className="btn-interactive mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)" }}
          >
            <AttachIcon />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message your coach…"
            disabled={streaming || savingEdit}
            aria-label="Message"
            className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--muted-2)]"
          />

          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              className="btn-interactive mb-0.5 shrink-0 rounded-xl border px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                borderColor: "var(--border-strong)",
                outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)",
              }}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              title="Send message"
              aria-label="Send message"
              className="btn-interactive mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-opacity disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: "linear-gradient(145deg, var(--primary) 0%, var(--primary-dim) 100%)",
                outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)",
              }}
            >
              <SendIcon />
            </button>
          )}
        </div>

        <div
          className="flex items-center justify-between gap-2 border-t px-3 py-1.5"
          style={{ borderColor: "var(--border)" }}
        >
          <ModelSelector
            models={models}
            selectedId={selectedModel}
            onChange={onModelChange}
            disabled={streaming || models.length === 0}
          />
          <span className="hidden text-[10px] text-[var(--muted-2)] sm:inline">
            Enter to send · Shift+Enter for newline
          </span>
        </div>
      </div>

      <p className="mt-2 text-center text-[10px] text-[var(--muted-2)] sm:hidden">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
