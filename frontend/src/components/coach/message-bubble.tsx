"use client";

import type { ChatAttachment, ChatMessage } from "@/lib/types";
import { ChatMarkdown } from "@/components/chat-markdown";
import { CollapsibleContent } from "@/components/collapsible-content";
import { EditIcon } from "@/components/coach/coach-icons";

function AttachmentChips({ attachments }: { attachments: ChatAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((a) => (
        <span
          key={a.name}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
          style={{
            borderColor: "color-mix(in srgb, white 16%, transparent)",
            background: "color-mix(in srgb, white 8%, transparent)",
            color: "color-mix(in srgb, white 85%, transparent)",
          }}
        >
          <span aria-hidden>{a.kind === "image" ? "🖼" : "📄"}</span>
          <span className="truncate">{a.name}</span>
        </span>
      ))}
    </div>
  );
}

export function MessageBubble({
  message,
  streaming,
  defaultExpanded,
  editing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  canEdit,
  savingEdit,
}: {
  message: ChatMessage;
  streaming?: boolean;
  defaultExpanded?: boolean;
  editing?: boolean;
  editDraft?: string;
  onEditDraftChange?: (v: string) => void;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  canEdit?: boolean;
  savingEdit?: boolean;
}) {
  const isUser = message.role === "user";
  const collapseFade = isUser
    ? "color-mix(in srgb, var(--primary-dim) 92%, transparent)"
    : "color-mix(in srgb, var(--panel-2) 94%, transparent)";

  return (
    <article
      className={`coach-message flex w-full min-w-0 gap-3 overflow-hidden ${
        isUser ? "flex-row-reverse" : ""
      }`}
      aria-label={isUser ? "Your message" : "Coach message"}
    >
      {!isUser && (
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{
            background: "linear-gradient(145deg, var(--primary) 0%, var(--primary-dim) 100%)",
            boxShadow:
              "0 0 0 1px color-mix(in srgb, var(--primary) 50%, transparent), 0 2px 8px -2px var(--glow-soft)",
          }}
          aria-hidden
        >
          C
        </div>
      )}

      <div
        className={`min-w-0 max-w-[min(100%,42rem)] flex-1 ${
          isUser ? "flex flex-col items-end" : ""
        }`}
      >
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-2 px-0.5">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Coach</span>
            {message.model_served && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide text-[var(--muted)]"
                style={{
                  background: "var(--panel-3)",
                  border: "1px solid var(--border)",
                }}
              >
                {message.model_served}
              </span>
            )}
          </div>
        )}

        <div className={`relative min-w-0 w-full ${isUser ? "group max-w-[85%]" : ""}`}>
          {isUser && canEdit && !editing && !streaming && (
            <button
              type="button"
              onClick={onStartEdit}
              title="Edit message"
              aria-label="Edit message"
              className="absolute -left-9 top-2 rounded-md p-1.5 text-[var(--muted)] opacity-0 transition-opacity hover:bg-[var(--panel-2)] hover:text-[var(--text)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 group-hover:opacity-100"
              style={{ outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)" }}
            >
              <EditIcon />
            </button>
          )}

          <div
            className={`coach-message-body block max-w-full overflow-hidden text-left text-[15px] leading-[1.65] [overflow-wrap:anywhere] [word-break:break-word] ${
              isUser
                ? "rounded-2xl rounded-br-md px-4 py-3 text-white"
                : "rounded-2xl rounded-tl-md border px-4 py-3 text-[var(--text)]"
            }`}
            style={
              isUser
                ? {
                    background:
                      "linear-gradient(145deg, var(--primary) 0%, color-mix(in srgb, var(--primary-dim) 88%, var(--primary)) 100%)",
                    boxShadow: "0 1px 2px color-mix(in srgb, black 24%, transparent)",
                    ["--collapse-fade" as string]: collapseFade,
                  }
                : {
                    borderColor: "var(--border-strong)",
                    background: "var(--panel-2)",
                    boxShadow: "inset 0 1px 0 color-mix(in srgb, white 4%, transparent)",
                    ["--collapse-fade" as string]: collapseFade,
                  }
            }
          >
            {isUser && message.attachments && (
              <AttachmentChips attachments={message.attachments} />
            )}

            {isUser && editing ? (
              <div className="space-y-3 text-left">
                <textarea
                  value={editDraft ?? message.content}
                  onChange={(e) => onEditDraftChange?.(e.target.value)}
                  rows={4}
                  aria-label="Edit message"
                  className="w-full min-w-[220px] resize-y rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/60 focus:border-white/40 focus-visible:ring-2 focus-visible:ring-white/30"
                  disabled={savingEdit}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    disabled={savingEdit}
                    className="rounded-lg px-3 py-1.5 text-xs text-white/85 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSaveEdit}
                    disabled={savingEdit || !(editDraft ?? message.content).trim()}
                    className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/30 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                  >
                    {savingEdit ? "Saving…" : "Save & regenerate"}
                  </button>
                </div>
              </div>
            ) : isUser ? (
              <CollapsibleContent
                defaultExpanded={defaultExpanded}
                disabled={streaming}
                variant="user"
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </CollapsibleContent>
            ) : (
              <CollapsibleContent
                defaultExpanded={defaultExpanded}
                disabled={streaming}
              >
                <div className="prose-chat coach-prose">
                  <ChatMarkdown content={message.content} />
                  {streaming && (
                    <span
                      className="coach-stream-cursor ml-0.5 inline-block h-[1.1em] w-[2px] align-text-bottom"
                      style={{ background: "var(--primary-2)" }}
                      aria-hidden
                    />
                  )}
                </div>
              </CollapsibleContent>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
