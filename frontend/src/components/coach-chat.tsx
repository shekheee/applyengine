"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { api } from "@/lib/api";
import type {
  ChatAttachment,
  ChatMessage,
  CoachModel,
  Memory,
  PendingAttachment,
} from "@/lib/types";
import { Badge, Button } from "@/components/ui";
import { ChatMarkdown } from "@/components/chat-markdown";
import { CollapsibleContent } from "@/components/collapsible-content";
import { ModelSelector, getStoredModelId, storeModelId } from "@/components/model-selector";
import { ResumeUpload } from "@/components/resume-upload";

const STARTERS = [
  "Help me sharpen my resume summary.",
  "I led a project recently — help me turn it into a bullet.",
  "What roles should I be targeting based on my background?",
  "What's missing from my resume for the roles I'm pursuing?",
];

const ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,.pdf,.txt,.md,.docx,application/pdf";

function AttachmentChips({ attachments }: { attachments: ChatAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <span
          key={a.name}
          className="inline-flex items-center gap-1 rounded-md border bg-[var(--panel)] px-2 py-0.5 text-xs text-[var(--muted)]"
          style={{ borderColor: "var(--border)" }}
        >
          {a.kind === "image" ? "🖼" : "📄"} {a.name}
        </span>
      ))}
    </div>
  );
}

function MessageBubble({
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
    ? "color-mix(in srgb, var(--primary) 88%, transparent)"
    : "color-mix(in srgb, var(--panel-2) 88%, transparent)";

  return (
    <div className={`flex w-full min-w-0 gap-3 overflow-hidden ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-sm text-white">
          ⚡
        </div>
      )}
      <div
        className={`max-w-[85%] min-w-0 flex-1 ${isUser ? "text-right" : "text-left"}`}
      >
        {!isUser && (
          <p className="mb-1 text-xs font-medium text-[var(--muted)]">
            Coach
            {message.model_served && (
              <span className="ml-1.5 font-normal opacity-70">· {message.model_served}</span>
            )}
          </p>
        )}
        <div className={`relative min-w-0 ${isUser ? "group" : ""}`}>
          {isUser && canEdit && !editing && !streaming && (
            <button
              type="button"
              onClick={onStartEdit}
              title="Edit message"
              className="absolute right-1 top-1 z-10 rounded-md p-1 text-white/70 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          )}
          <div
            className={`block max-w-full overflow-hidden rounded-2xl px-4 py-3 text-left text-sm [overflow-wrap:anywhere] [word-break:break-word] ${
              isUser
                ? "bg-[var(--primary)] text-white"
                : "border bg-[var(--panel-2)] text-[var(--text)]"
            }`}
            style={
              !isUser
                ? { borderColor: "var(--border)", ["--collapse-fade" as string]: collapseFade }
                : { ["--collapse-fade" as string]: collapseFade }
            }
          >
            {isUser && message.attachments && (
              <AttachmentChips attachments={message.attachments} />
            )}
            {isUser && editing ? (
              <div className="space-y-2 text-left">
                <textarea
                  value={editDraft ?? message.content}
                  onChange={(e) => onEditDraftChange?.(e.target.value)}
                  rows={4}
                  className="w-full min-w-[220px] resize-y rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/60 focus:border-white/40"
                  disabled={savingEdit}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    disabled={savingEdit}
                    className="rounded-lg px-2.5 py-1 text-xs text-white/80 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSaveEdit}
                    disabled={savingEdit || !(editDraft ?? message.content).trim()}
                    className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/30 disabled:opacity-50"
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
                <p className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
                  {message.content}
                </p>
              </CollapsibleContent>
            ) : (
              <CollapsibleContent
                defaultExpanded={defaultExpanded}
                disabled={streaming}
              >
                <div className="prose-chat">
                  <ChatMarkdown content={message.content} />
                  {streaming && (
                    <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[var(--primary-2)]" />
                  )}
                </div>
              </CollapsibleContent>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CoachChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [applyState, setApplyState] = useState<"idle" | "working" | "done">("idle");
  const [pdfState, setPdfState] = useState<"idle" | "working" | "done">("idle");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [models, setModels] = useState<CoachModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [m, mem, modelData] = await Promise.all([
          api.listMessages(),
          api.listMemories(),
          api.listCoachModels(),
        ]);
        setMessages(m);
        setMemories(mem);
        setModels(modelData.models);
        const stored = getStoredModelId();
        const valid =
          stored && modelData.models.some((x) => x.id === stored)
            ? stored
            : modelData.default_model;
        setSelectedModel(valid);
        if (valid) storeModelId(valid);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load coach.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamText, streaming, scrollToBottom]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next: PendingAttachment[] = [];
    for (const file of Array.from(fileList)) {
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      next.push({ file, preview });
    }
    setPendingFiles((prev) => [...prev, ...next].slice(0, 5));
  }

  function removePending(idx: number) {
    setPendingFiles((prev) => {
      const item = prev[idx];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function cancelEdit() {
    if (savingEdit) return;
    setEditingId(null);
    setEditDraft("");
  }

  function startEdit(message: ChatMessage) {
    if (streaming || savingEdit || message.role !== "user") return;
    setEditingId(message.id);
    setEditDraft(message.content);
  }

  async function saveEdit() {
    if (editingId == null || streaming || savingEdit) return;
    const text = editDraft.trim();
    if (!text) return;

    const editIndex = messages.findIndex((m) => m.id === editingId);
    if (editIndex < 0) return;

    setError("");
    setSavingEdit(true);
    setStreaming(true);
    setStreamText("");
    setEditingId(null);

    const kept = messages.slice(0, editIndex + 1).map((m) =>
      m.id === editingId ? { ...m, content: text } : m
    );
    setMessages(kept);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await api.editMessageStream(
        editingId,
        text,
        (token) => setStreamText((prev) => prev + token),
        controller.signal,
        selectedModel || undefined
      );
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === result.user_message.id);
        const before = idx >= 0 ? prev.slice(0, idx) : prev;
        return [...before, result.user_message, result.assistant_message];
      });
      setMemories(await api.listMemories());
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Failed to regenerate.");
        setMessages(await api.listMessages());
      }
    } finally {
      setSavingEdit(false);
      setStreaming(false);
      setStreamText("");
      setEditDraft("");
      abortRef.current = null;
    }
  }

  async function send(textOverride?: string) {
    const content = (textOverride ?? input).trim();
    if ((!content && pendingFiles.length === 0) || streaming) return;

    setError("");
    const files = pendingFiles.map((p) => p.file);
    const attMeta: ChatAttachment[] = files.map((f) => ({
      name: f.name,
      kind: f.type.startsWith("image/") ? "image" : "document",
      mime: f.type || undefined,
    }));

    const optimistic: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: content || "(attachment)",
      attachments: attMeta,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    pendingFiles.forEach((p) => {
      if (p.preview) URL.revokeObjectURL(p.preview);
    });
    setPendingFiles([]);
    setStreaming(true);
    setStreamText("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await api.sendMessageStream(
        content,
        files,
        (token) => setStreamText((prev) => prev + token),
        controller.signal,
        selectedModel || undefined
      );
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        result.user_message,
        result.assistant_message,
      ]);
      setMemories(await api.listMemories());
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        if (streamText.trim()) {
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== optimistic.id),
            optimistic,
            {
              id: Date.now() + 1,
              role: "assistant",
              content: streamText.trim(),
              created_at: new Date().toISOString(),
            },
          ]);
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          setInput(content);
        }
      } else {
        setError(e instanceof Error ? e.message : "Failed to send message.");
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput(content);
      }
    } finally {
      setStreaming(false);
      setStreamText("");
      abortRef.current = null;
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function removeMemory(id: number) {
    await api.deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function updateResume() {
    setApplyState("working");
    setError("");
    try {
      await api.applyToResume();
      setApplyState("done");
      setTimeout(() => setApplyState("idle"), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update resume.");
      setApplyState("idle");
    }
  }

  async function downloadPdf() {
    setPdfState("working");
    setError("");
    try {
      const { blob, filename } = await api.downloadResumePdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPdfState("done");
      setTimeout(() => setPdfState("idle"), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate PDF resume.");
      setPdfState("idle");
    }
  }

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center text-[var(--muted)]">
        Loading coach…
      </div>
    );
  }

  const sidebar = (
    <div className="space-y-4">
      <ResumeUpload compact />
      <div
        className="rounded-xl border bg-[var(--panel)] p-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">What I&apos;ve learned</h2>
          <Badge tone="primary">{memories.length}</Badge>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Facts the coach remembers about you.
        </p>
        <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
          {memories.length === 0 && (
            <p className="text-sm text-[var(--muted)]">Nothing yet — start chatting.</p>
          )}
          {memories.map((m) => (
            <div
              key={m.id}
              className="group flex items-start justify-between gap-2 rounded-lg border p-2"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="min-w-0">
                <Badge tone="primary">{m.kind}</Badge>
                <p className="mt-1 text-xs text-[var(--text)]">{m.content}</p>
              </div>
              <button
                onClick={() => removeMemory(m.id)}
                className="shrink-0 text-[var(--muted)] opacity-0 hover:text-red-300 group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
      <div
        className="rounded-xl border bg-[var(--panel)] p-4"
        style={{ borderColor: "var(--border)" }}
      >
        <h2 className="font-semibold">Update my resume</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Fold learned facts into your profile.
        </p>
        <Button
          onClick={updateResume}
          disabled={applyState === "working"}
          className="mt-3 w-full"
          variant="outline"
        >
          {applyState === "working"
            ? "Updating…"
            : applyState === "done"
              ? "✓ Resume updated"
              : "Update my resume"}
        </Button>
        <Button
          onClick={downloadPdf}
          disabled={pdfState === "working"}
          className="mt-2 w-full"
        >
          {pdfState === "working"
            ? "Generating PDF…"
            : pdfState === "done"
              ? "✓ PDF downloaded"
              : "Download PDF resume"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden lg:flex-row lg:gap-3">
      {/* Main chat column — ChatGPT-style */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mb-2 flex shrink-0 items-center justify-between lg:hidden">
          <h1 className="text-base font-semibold">Career coach</h1>
          <Button variant="outline" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? "Hide panel" : "Memory"}
          </Button>
        </div>
        {sidebarOpen && <div className="mb-2 shrink-0 lg:hidden">{sidebar}</div>}

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-xl border bg-[var(--panel)] px-3 py-4 sm:px-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="mx-auto w-full min-w-0 max-w-3xl space-y-5">
            {messages.length === 0 && !streaming && (
              <div className="flex flex-col items-center py-12 text-center">
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--primary)] text-3xl text-white shadow-lg shadow-violet-500/20">
                  ⚡
                </div>
                <h2 className="text-xl font-semibold">How can I help with your career?</h2>
                <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                  Ask about resume bullets, interview prep, or attach a PDF or screenshot
                  for feedback.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      disabled={streaming || savingEdit}
                      className="rounded-full border px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--text)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, idx) => {
              const isInLatestPair =
                idx >= messages.length - 2 || messages.length <= 2;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  defaultExpanded={isInLatestPair}
                  editing={editingId === m.id}
                  editDraft={editDraft}
                  onEditDraftChange={setEditDraft}
                  onStartEdit={() => startEdit(m)}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  canEdit={m.role === "user" && m.id > 0}
                  savingEdit={savingEdit}
                />
              );
            })}

            {streaming && streamText && (
              <MessageBubble
                message={{
                  id: -1,
                  role: "assistant",
                  content: streamText,
                  created_at: new Date().toISOString(),
                }}
                streaming
                defaultExpanded
              />
            )}

            {streaming && !streamText && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-sm text-white">
                  ⚡
                </div>
                <div
                  className="rounded-2xl border bg-[var(--panel-2)] px-4 py-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="inline-flex gap-1">
                    <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-2 shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {/* Composer — pinned to bottom */}
        <div className="mt-2 shrink-0">
          <div
            className="mx-auto w-full min-w-0 max-w-3xl rounded-2xl border bg-[var(--panel-2)] shadow-lg shadow-black/20"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5"
              style={{ borderColor: "var(--border)" }}
            >
              <ModelSelector
                models={models}
                selectedId={selectedModel}
                onChange={setSelectedModel}
                disabled={streaming || models.length === 0}
              />
              <span className="hidden text-[10px] text-[var(--muted)] sm:inline">
                Enter to send · Shift+Enter newline
              </span>
            </div>
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
                {pendingFiles.map((p, i) => (
                  <div
                    key={`${p.file.name}-${i}`}
                    className="relative flex items-center gap-2 rounded-lg border bg-[var(--panel)] px-2 py-1 text-xs"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {p.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.preview}
                        alt={p.file.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                    ) : (
                      <span>📄</span>
                    )}
                    <span className="max-w-[120px] truncate text-[var(--muted)]">
                      {p.file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePending(i)}
                      className="text-[var(--muted)] hover:text-red-300"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 p-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={streaming || savingEdit}
                className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text)] disabled:opacity-40"
                title="Attach file"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Message your coach…"
                disabled={streaming || savingEdit}
                className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-1 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
              />
              {streaming ? (
                <Button variant="outline" size="sm" onClick={stopStreaming} className="mb-0.5 shrink-0">
                  Stop
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={() => send()}
                  disabled={!input.trim() && pendingFiles.length === 0}
                  className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white transition-opacity hover:bg-[var(--primary-2)] disabled:opacity-40"
                  title="Send"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.52 1.05l2.7 8.35-2.7 8.35A1 1 0 003.4 20.4z" />
                  </svg>
                </button>
              )}
            </div>
            <p className="px-3 pb-2 text-center text-[10px] text-[var(--muted)] sm:hidden">
              Enter to send · Shift+Enter newline
            </p>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden w-64 shrink-0 overflow-y-auto lg:block">{sidebar}</div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--muted)]"
      style={{ animationDelay: delay }}
    />
  );
}
