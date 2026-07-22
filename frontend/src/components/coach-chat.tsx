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
  ChatMessage,
  CoachModel,
  Conversation,
  Job,
  Memory,
  PendingAttachment,
} from "@/lib/types";
import {
  NewConversationDialog,
  getStoredConversationId,
  storeConversationId,
} from "@/components/coach-conversations";
import { CoachComposer } from "@/components/coach/coach-composer";
import { CoachEmptyState } from "@/components/coach/coach-empty-state";
import { CoachHeader } from "@/components/coach/coach-header";
import { CoachToolsPanel } from "@/components/coach/coach-tools-panel";
import { CoachTypingIndicator } from "@/components/coach/coach-typing-indicator";
import { ConversationSidebar } from "@/components/coach/conversation-sidebar";
import { MessageBubble } from "@/components/coach/message-bubble";
import { getStoredModelId, storeModelId } from "@/components/model-selector";

const STARTERS = [
  "Help me sharpen my resume summary.",
  "I led a project recently — help me turn it into a bullet.",
  "What roles should I be targeting based on my background?",
  "What's missing from my resume for the roles I'm pursuing?",
];

const JD_STARTERS = [
  "Prep me for an interview for this role.",
  "What are the likely interview questions for this JD?",
  "How does my resume align with this job?",
  "What gaps should I address before applying?",
];

export function CoachChat({
  initialConversationId,
  embedded = false,
  applicationId,
}: {
  initialConversationId?: number;
  embedded?: boolean;
  applicationId?: number;
} = {}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [convBusy, setConvBusy] = useState(false);
  const [convListOpen, setConvListOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [applyState, setApplyState] = useState<"idle" | "working" | "done">("idle");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [models, setModels] = useState<CoachModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  const loadMessages = useCallback(async (conversationId: number) => {
    const m = await api.listMessages(conversationId);
    setMessages(m);
  }, []);

  const selectConversation = useCallback(
    async (id: number, convs?: Conversation[]) => {
      setActiveConversationId(id);
      storeConversationId(id);
      const list = convs ?? conversations;
      setActiveConversation(list.find((c) => c.id === id) ?? null);
      setEditingId(null);
      setEditDraft("");
      setInput("");
      try {
        await loadMessages(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load messages.");
      }
    },
    [conversations, loadMessages]
  );

  useEffect(() => {
    async function load() {
      try {
        let resolvedConvId: number | null = null;

        if (applicationId != null) {
          const roleConv = await api.getOrCreateApplicationConversation(applicationId);
          resolvedConvId = roleConv.id;
        }

        const [convs, mem, modelData, jobList] = await Promise.all([
          api.listConversations(),
          api.listMemories(),
          api.listCoachModels(),
          api.listJobs().catch(() => []),
        ]);
        setConversations(convs);
        setJobs(jobList);
        setMemories(mem);
        setModels(modelData.models);
        const stored = getStoredModelId();
        const valid =
          stored && modelData.models.some((x) => x.id === stored)
            ? stored
            : modelData.default_model;
        setSelectedModel(valid);
        if (valid) storeModelId(valid);

        const urlConv =
          resolvedConvId ??
          (initialConversationId &&
          convs.some((c) => c.id === initialConversationId)
            ? initialConversationId
            : null);
        const storedConv = embedded || applicationId != null ? null : getStoredConversationId();
        const active =
          urlConv ??
          (storedConv && convs.some((c) => c.id === storedConv)
            ? storedConv
            : embedded || applicationId != null
              ? null
              : convs[0]?.id ?? null);
        if (active != null) {
          setActiveConversationId(active);
          if (!embedded && applicationId == null) storeConversationId(active);
          setActiveConversation(convs.find((c) => c.id === active) ?? null);
          const m = await api.listMessages(active);
          setMessages(m);
        } else if (applicationId != null && resolvedConvId != null) {
          setActiveConversationId(resolvedConvId);
          const roleConv = convs.find((c) => c.id === resolvedConvId);
          setActiveConversation(roleConv ?? null);
          const m = await api.listMessages(resolvedConvId);
          setMessages(m);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load coach.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [initialConversationId, embedded, applicationId]);

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
      const convs = await api.listConversations();
      setConversations(convs);
      if (activeConversationId) {
        setActiveConversation(
          convs.find((c) => c.id === activeConversationId) ?? null
        );
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Failed to regenerate.");
        setMessages(await api.listMessages(activeConversationId!));
      }
    } finally {
      setSavingEdit(false);
      setStreaming(false);
      setStreamText("");
      setEditDraft("");
      abortRef.current = null;
    }
  }

  async function createConversation(opts: {
    title?: string;
    job_id?: number;
    jd_text?: string;
  }) {
    setConvBusy(true);
    setError("");
    try {
      const conv = await api.createConversation(opts);
      const next = [conv, ...conversations];
      setConversations(next);
      setShowNewConv(false);
      await selectConversation(conv.id, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create conversation.");
    } finally {
      setConvBusy(false);
    }
  }

  async function renameConversation(id: number, title: string) {
    try {
      const updated = await api.renameConversation(id, title);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? updated : c))
      );
      if (activeConversationId === id) setActiveConversation(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed.");
    }
  }

  async function deleteConversation(id: number) {
    if (!confirm("Delete this conversation and all its messages?")) return;
    try {
      await api.deleteConversation(id);
      const next = conversations.filter((c) => c.id !== id);
      setConversations(next);
      if (activeConversationId === id) {
        const fallback = next[0]?.id ?? null;
        if (fallback != null) await selectConversation(fallback, next);
        else {
          setActiveConversationId(null);
          setActiveConversation(null);
          setMessages([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  async function send(textOverride?: string) {
    const content = (textOverride ?? input).trim();
    if ((!content && pendingFiles.length === 0) || streaming) return;
    if (activeConversationId == null) {
      setError("Select or create a conversation first.");
      return;
    }

    setError("");
    const files = pendingFiles.map((p) => p.file);
    const attMeta = files.map((f) => ({
      name: f.name,
      kind: f.type.startsWith("image/") ? ("image" as const) : ("document" as const),
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
        selectedModel || undefined,
        activeConversationId
      );
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        result.user_message,
        result.assistant_message,
      ]);
      setMemories(await api.listMemories());
      const convs = await api.listConversations();
      setConversations(convs);
      if (activeConversationId) {
        setActiveConversation(
          convs.find((c) => c.id === activeConversationId) ?? null
        );
      }
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

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center text-[var(--muted)] ${
          embedded ? "h-[min(70vh,640px)]" : "h-[70vh]"
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="skeleton h-8 w-8 rounded-full" />
          <span className="text-sm">Loading coach…</span>
        </div>
      </div>
    );
  }

  const openInCoachHref =
    activeConversationId != null
      ? `/coach?conversation_id=${activeConversationId}`
      : "/coach";

  const starters = activeConversation?.has_jd ? JD_STARTERS : STARTERS;

  return (
    <div
      className={`coach-shell flex min-h-0 flex-col overflow-hidden ${
        embedded ? "h-[min(70vh,720px)]" : "h-full lg:flex-row"
      }`}
      style={{ background: embedded ? undefined : "var(--bg-elevated)" }}
    >
      {!embedded && (
        <ConversationSidebar
          open={convListOpen}
          onClose={() => setConvListOpen(false)}
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={(id) => void selectConversation(id)}
          onNew={() => setShowNewConv(true)}
          onRename={renameConversation}
          onDelete={deleteConversation}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <CoachHeader
          embedded={embedded}
          activeConversation={activeConversation}
          convListOpen={convListOpen}
          onToggleConvList={() => setConvListOpen(!convListOpen)}
          toolsOpen={toolsOpen}
          onToggleTools={() => setToolsOpen(!toolsOpen)}
          openInCoachHref={openInCoachHref}
        />

        {!embedded && toolsOpen && (
          <div
            className="shrink-0 overflow-hidden border-b lg:hidden"
            style={{ borderColor: "var(--border)", maxHeight: "40vh" }}
          >
            <CoachToolsPanel
              memories={memories}
              onRemoveMemory={removeMemory}
              applyState={applyState}
              onUpdateResume={updateResume}
            />
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="coach-thread-fade absolute inset-x-0 top-0 z-10 h-6" aria-hidden />

          <div
            ref={scrollRef}
            className="coach-thread-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-6 sm:px-4"
          >
            <div className="mx-auto w-full min-w-0 max-w-[680px] space-y-6">
              {messages.length === 0 && !streaming && (
                <CoachEmptyState
                  embedded={embedded}
                  hasJd={activeConversation?.has_jd}
                  starters={starters}
                  onStarter={send}
                  disabled={streaming || savingEdit}
                />
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

              {streaming && !streamText && <CoachTypingIndicator />}
            </div>
          </div>

          <div className="coach-composer-fade absolute inset-x-0 bottom-[7.5rem] h-8 sm:bottom-[8rem]" aria-hidden />

          {error && (
            <div className="shrink-0 px-3 sm:px-4">
              <p
                className="mx-auto max-w-[680px] rounded-xl border px-3 py-2 text-sm"
                role="alert"
                style={{
                  borderColor: "color-mix(in srgb, var(--red) 40%, transparent)",
                  background: "color-mix(in srgb, var(--red) 10%, transparent)",
                  color: "var(--red)",
                }}
              >
                {error}
              </p>
            </div>
          )}

          <CoachComposer
            input={input}
            onInputChange={setInput}
            onKeyDown={onKeyDown}
            onSend={() => send()}
            onStop={stopStreaming}
            streaming={streaming}
            savingEdit={savingEdit}
            pendingFiles={pendingFiles}
            onAddFiles={addFiles}
            onRemovePending={removePending}
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            textareaRef={textareaRef}
          />
        </div>
      </div>

      {!embedded && (
        <div
          className="hidden w-64 shrink-0 overflow-y-auto border-l lg:block"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
          <CoachToolsPanel
            memories={memories}
            onRemoveMemory={removeMemory}
            applyState={applyState}
            onUpdateResume={updateResume}
          />
        </div>
      )}

      {!embedded && (
        <NewConversationDialog
          open={showNewConv}
          onClose={() => setShowNewConv(false)}
          onCreate={createConversation}
          jobs={jobs}
          busy={convBusy}
        />
      )}
    </div>
  );
}
