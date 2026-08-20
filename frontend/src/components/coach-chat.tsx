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
  AnswerLength,
  BuddyDashboard,
  ChatMessage,
  CoachMode,
  CoachModel,
  Conversation,
  DeliveryMetrics,
  Job,
  Memory,
  PendingAttachment,
  ReasoningEffort,
  WebSearchMode,
  VocabularyTerm,
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
import { CommunicationPracticeBar } from "@/components/coach/communication-practice-bar";
import { BuddyBar } from "@/components/coach/buddy-bar";
import { ConversationSidebar } from "@/components/coach/conversation-sidebar";
import { MessageBubble } from "@/components/coach/message-bubble";
import { getStoredModelId, storeModelId } from "@/components/model-selector";
import { useVoiceRecorder, type RecordedAudio } from "@/hooks/use-voice-recorder";
import { useRealtimeBuddy } from "@/hooks/use-realtime-buddy";
import { mergeDeliveryAnalysis } from "@/lib/audio";

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

const COMMUNICATION_STARTERS = [
  "Test how clearly I can explain a stale or blocked production run.",
  "Give me a 30-second senior stakeholder update to practise.",
  "Ask me a competency question and catch repeated ideas.",
  "Help me activate stronger technical and business vocabulary.",
];

const BUDDY_STARTERS = [
  "Ask me to explain a technical concept I use at work.",
  "Talk through an architecture trade-off with me as a peer.",
  "Give me a production incident to diagnose aloud.",
  "Help me tell one project story with clearer ownership and impact.",
];

const WEB_SEARCH_MODE_KEY = "applyengine_web_search_mode";
const REASONING_EFFORT_KEY = "applyengine_reasoning_effort";
const ANSWER_LENGTH_KEY = "applyengine_answer_length";
const COACH_MODE_KEY = "applyengine_coach_mode";
const BUDDY_AUTO_SEND_KEY = "applyengine_buddy_auto_send";
const BUDDY_READ_REPLIES_KEY = "applyengine_buddy_read_replies";

function getStoredWebSearchMode(): WebSearchMode {
  if (typeof window === "undefined") return "auto";
  const value = window.localStorage.getItem(WEB_SEARCH_MODE_KEY);
  return value === "on" || value === "off" ? value : "auto";
}

function getStoredReasoningEffort(): ReasoningEffort {
  if (typeof window === "undefined") return "medium";
  const value = window.localStorage.getItem(REASONING_EFFORT_KEY);
  return value === "high" || value === "xhigh" ? value : "medium";
}

function getStoredAnswerLength(): AnswerLength {
  if (typeof window === "undefined") return "normal";
  const value = window.localStorage.getItem(ANSWER_LENGTH_KEY);
  return value === "concise" || value === "detailed" ? value : "normal";
}

function getStoredCoachMode(): CoachMode {
  if (typeof window === "undefined") return "career";
  const value = window.localStorage.getItem(COACH_MODE_KEY);
  return value === "communication" || value === "buddy" ? value : "career";
}

function getStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  return value == null ? fallback : value === "true";
}

function speakBuddyReply(markdown: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const spoken = markdown
    .replace(/```[\s\S]*?```/g, " Code example omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spoken) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.rate = 1.04;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function CoachChat({
  initialConversationId,
  initialCoachMode,
  embedded = false,
  applicationId,
  fullscreen = false,
  onToggleFullscreen,
}: {
  initialConversationId?: number;
  initialCoachMode?: CoachMode;
  embedded?: boolean;
  applicationId?: number;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
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
  const [activeRoute, setActiveRoute] = useState<Partial<ChatMessage> | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [webSearchMode, setWebSearchMode] = useState<WebSearchMode>("auto");
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("medium");
  const [answerLength, setAnswerLength] = useState<AnswerLength>("normal");
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [coachMode, setCoachMode] = useState<CoachMode>(initialCoachMode ?? "career");
  const [autoSendVoice, setAutoSendVoice] = useState(true);
  const [readBuddyReplies, setReadBuddyReplies] = useState(true);
  const [voiceDelivery, setVoiceDelivery] = useState<DeliveryMetrics | null>(null);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [buddyDashboard, setBuddyDashboard] = useState<BuddyDashboard | null>(null);
  const [buddyDashboardLoading, setBuddyDashboardLoading] = useState(true);
  const voiceAnalysisVersionRef = useRef(0);

  const refreshBuddyDashboard = useCallback(async () => {
    try {
      setBuddyDashboard(await api.getBuddyDashboard());
    } finally {
      setBuddyDashboardLoading(false);
    }
  }, []);

  async function processRecordedAudio(recorded: RecordedAudio | null) {
    setTranscribingVoice(true);
    setTranscriptionError(null);
    try {
      if (!recorded || recorded.blob.size < 100) {
        setTranscriptionError("Recording too short. Try again.");
        return;
      }
      const result = await api.transcribeInterviewAudio(
        recorded.blob,
        recorded.mime,
        recorded.duration,
        recorded.metrics
      );
      setInput(result.text);
      setVoiceDelivery(result.delivery);
      if (coachMode === "buddy" && buddyDashboard?.active_session) {
        await api.updateBuddySession(buddyDashboard.active_session.id, {
          spoken_seconds_delta: recorded.duration,
          words_spoken_delta: result.text.trim().split(/\s+/).filter(Boolean).length,
          turn_count_delta: 1,
        });
        await refreshBuddyDashboard();
      }
      const analysisVersion = voiceAnalysisVersionRef.current + 1;
      voiceAnalysisVersionRef.current = analysisVersion;
      void api
        .analyzeInterviewAudio(
          recorded.blob,
          recorded.mime,
          recorded.duration,
          result.text,
          recorded.metrics
        )
        .then((analysis) => {
          if (voiceAnalysisVersionRef.current !== analysisVersion) return;
          setVoiceDelivery((current) =>
            current ? mergeDeliveryAnalysis(current, analysis) : current
          );
        })
        .catch(() => undefined);
      if (coachMode === "buddy" && autoSendVoice) {
        await send(result.text, result.delivery);
      } else {
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } catch (e) {
      setTranscriptionError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setTranscribingVoice(false);
    }
  }

  const voice = useVoiceRecorder(processRecordedAudio);

  const handleRealtimeTurn = useCallback(
    (turn: { role: "user" | "assistant"; content: string; durationSeconds: number }) => {
      if (activeConversationId == null) return;
      const optimistic: ChatMessage = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        role: turn.role,
        content: turn.content,
        created_at: new Date().toISOString(),
        model_served: turn.role === "assistant" ? "OpenAI Realtime" : undefined,
        provider_served: turn.role === "assistant" ? "openai" : undefined,
      };
      setMessages((previous) => [...previous, optimistic]);
      void api
        .saveBuddyTurn({
          conversation_id: activeConversationId,
          session_id: buddyDashboard?.active_session?.id,
          role: turn.role,
          content: turn.content,
          duration_seconds: turn.durationSeconds,
          word_count: turn.content.trim().split(/\s+/).filter(Boolean).length,
        })
        .then(async () => {
          await refreshBuddyDashboard();
          setConversations(await api.listConversations());
        })
        .catch((cause) => {
          setError(cause instanceof Error ? cause.message : "Could not save the live conversation.");
        });
    },
    [activeConversationId, buddyDashboard?.active_session?.id, refreshBuddyDashboard]
  );

  const realtimeBuddy = useRealtimeBuddy({
    conversationId: activeConversationId,
    sessionId: buddyDashboard?.active_session?.id ?? null,
    onTurn: handleRealtimeTurn,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const applyConversationUpdate = useCallback(
    (updated?: Conversation) => {
      if (!updated) return;
      setConversations((previous) => [
        updated,
        ...previous.filter((conversation) => conversation.id !== updated.id),
      ]);
      if (activeConversationId === updated.id) setActiveConversation(updated);
    },
    [activeConversationId]
  );

  const refreshMemoriesInBackground = useCallback((delay = 0) => {
    window.setTimeout(() => {
      void api.listMemories().then(setMemories).catch(() => undefined);
    }, delay);
  }, []);

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

        const [convs, mem, modelData, jobList, buddyData] = await Promise.all([
          api.listConversations(),
          api.listMemories(),
          api.listCoachModels(),
          api.listJobs().catch(() => []),
          api.getBuddyDashboard().catch(() => null),
        ]);
        setConversations(convs);
        setJobs(jobList);
        setMemories(mem);
        setModels(modelData.models);
        setBuddyDashboard(buddyData);
        setBuddyDashboardLoading(false);
        setWebSearchMode(getStoredWebSearchMode());
        setReasoningEffort(getStoredReasoningEffort());
        setAnswerLength(getStoredAnswerLength());
        const preferredMode =
          embedded || applicationId != null
            ? "career"
            : initialCoachMode ?? getStoredCoachMode();
        setCoachMode(preferredMode);
        setAutoSendVoice(getStoredBoolean(BUDDY_AUTO_SEND_KEY, true));
        setReadBuddyReplies(getStoredBoolean(BUDDY_READ_REPLIES_KEY, true));
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
  }, [initialConversationId, initialCoachMode, embedded, applicationId]);

  useEffect(() => {
    if (coachMode === "buddy") void refreshBuddyDashboard();
  }, [coachMode, refreshBuddyDashboard]);

  useEffect(() => {
    if (toolsOpen) refreshMemoriesInBackground();
  }, [toolsOpen, refreshMemoriesInBackground]);

  useEffect(() => {
    if (messages.length === 0 && !streaming) {
      scrollRef.current?.scrollTo({ top: 0 });
      return;
    }
    scrollToBottom();
  }, [messages, streamText, streaming, scrollToBottom]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Imperative textarea autosizing keeps the composer compact while typing.
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
    setActiveRoute(null);
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
        selectedModel || undefined,
        webSearchMode,
        reasoningEffort,
        answerLength,
        coachMode,
        setSearchingWeb,
        setActiveRoute
      );
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === result.user_message.id);
        const before = idx >= 0 ? prev.slice(0, idx) : prev;
        return [...before, result.user_message, result.assistant_message];
      });
      applyConversationUpdate(result.conversation);
      if (toolsOpen) refreshMemoriesInBackground(1400);
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
      setSearchingWeb(false);
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

  async function send(textOverride?: string, deliveryOverride?: DeliveryMetrics) {
    const content = (textOverride ?? input).trim();
    if ((!content && pendingFiles.length === 0) || streaming) return;
    if (activeConversationId == null) {
      setError("Select or create a conversation first.");
      return;
    }

    setError("");
    const files = pendingFiles.map((p) => p.file);
    const delivery =
      deliveryOverride ?? (textOverride == null ? voiceDelivery ?? undefined : undefined);
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
        activeConversationId,
        webSearchMode,
        reasoningEffort,
        answerLength,
        coachMode,
        delivery,
        setSearchingWeb,
        setActiveRoute
      );
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        result.user_message,
        result.assistant_message,
      ]);
      if (coachMode === "buddy" && readBuddyReplies) {
        speakBuddyReply(result.assistant_message.content);
      }
      setVoiceDelivery(null);
      applyConversationUpdate(result.conversation);
      if (toolsOpen) refreshMemoriesInBackground(1400);
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
      setSearchingWeb(false);
      abortRef.current = null;
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function handleMicClick() {
    if (voice.state === "recording") {
      await processRecordedAudio(await voice.finishRecording());
      return;
    }
    if (voice.state === "processing" || transcribingVoice) return;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setVoiceDelivery(null);
    setTranscriptionError(null);
    await voice.startRecording();
  }

  async function startBuddyDaily(topic: string, prompt: string) {
    if (activeConversationId == null) return;
    setError("");
    setBuddyDashboardLoading(true);
    try {
      await api.startBuddySession({
        conversation_id: activeConversationId,
        topic,
        goal: "Speak freely, then make the main point precise and concise",
        target_minutes: 10,
      });
      await refreshBuddyDashboard();
      if (messages.length === 0) setInput(prompt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start today's session.");
      setBuddyDashboardLoading(false);
    }
  }

  async function addBuddyVocabulary(term: string, meaning: string) {
    await api.addVocabulary({ term, meaning, source: "buddy" });
    await refreshBuddyDashboard();
  }

  function practiseBuddyVocabulary(term: VocabularyTerm) {
    void api.updateVocabulary(term.id, { practise: true }).then(refreshBuddyDashboard);
    void send(
      `Help me activate the phrase “${term.term}”. ${term.meaning ? `I understand it as: ${term.meaning}. ` : ""}Ask me one technical question where I can use it naturally, then correct only my usage.`
    );
  }

  function deleteBuddyVocabulary(id: number) {
    void api.deleteVocabulary(id).then(refreshBuddyDashboard);
  }

  function changeCoachMode(mode: CoachMode) {
    setCoachMode(mode);
    window.localStorage.setItem(COACH_MODE_KEY, mode);
    voice.setError(null);
    setTranscriptionError(null);
    if (mode === "career") setVoiceDelivery(null);
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

  const starters =
    coachMode === "communication"
      ? COMMUNICATION_STARTERS
      : coachMode === "buddy"
        ? BUDDY_STARTERS
      : activeConversation?.has_jd
        ? JD_STARTERS
        : STARTERS;

  return (
    <div
      className={`coach-shell flex min-h-0 flex-col overflow-hidden ${
        embedded ? "h-[min(70vh,720px)]" : "h-full lg:flex-row"
      } ${fullscreen ? "coach-shell-fullscreen" : ""}`}
      style={{ background: embedded ? undefined : "var(--bg-elevated)" }}
    >
      {!embedded && !fullscreen && (
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
          fullscreen={fullscreen}
          onToggleFullscreen={onToggleFullscreen}
          coachMode={coachMode}
          onCoachModeChange={changeCoachMode}
        />

        {!embedded && coachMode === "communication" && (
          <CommunicationPracticeBar
            onStartDrill={(prompt) => void send(prompt)}
            disabled={streaming || savingEdit || activeConversationId == null}
            voice={{ ...voice, error: transcriptionError || voice.error }}
            transcribing={transcribingVoice}
            onMicClick={() => void handleMicClick()}
            onCancelRecording={() => void voice.cancelRecording()}
            delivery={voiceDelivery}
            onClearDelivery={() => setVoiceDelivery(null)}
          />
        )}

        {!embedded && coachMode === "buddy" && (
          <BuddyBar
            onStartTopic={(prompt) => void send(prompt)}
            onStartDaily={(topic, prompt) => void startBuddyDaily(topic, prompt)}
            disabled={streaming || savingEdit || activeConversationId == null}
            dashboard={buddyDashboard}
            dashboardLoading={buddyDashboardLoading}
            realtime={{
              state: realtimeBuddy.state,
              error: realtimeBuddy.error,
              isSupported: realtimeBuddy.isSupported,
              isActive: realtimeBuddy.isActive,
              onStart: (kickoff) => void realtimeBuddy.start(kickoff),
              onStop: realtimeBuddy.stop,
              onInterrupt: realtimeBuddy.interrupt,
            }}
            voice={{ ...voice, error: transcriptionError || voice.error }}
            transcribing={transcribingVoice}
            onMicClick={() => void handleMicClick()}
            onCancelRecording={() => void voice.cancelRecording()}
            delivery={voiceDelivery}
            onClearDelivery={() => setVoiceDelivery(null)}
            autoSendVoice={autoSendVoice}
            onAutoSendVoiceChange={(value) => {
              setAutoSendVoice(value);
              window.localStorage.setItem(BUDDY_AUTO_SEND_KEY, String(value));
            }}
            readReplies={readBuddyReplies}
            onReadRepliesChange={(value) => {
              setReadBuddyReplies(value);
              window.localStorage.setItem(BUDDY_READ_REPLIES_KEY, String(value));
              if (!value) window.speechSynthesis?.cancel();
            }}
            onAddVocabulary={addBuddyVocabulary}
            onPracticeVocabulary={practiseBuddyVocabulary}
            onDeleteVocabulary={deleteBuddyVocabulary}
          />
        )}

        {!embedded && !fullscreen && toolsOpen && (
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
            className="coach-thread-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-4 sm:px-3 sm:py-5"
          >
            <div className="coach-thread-inner mx-auto w-full min-w-0 space-y-6">
              {messages.length === 0 && !streaming && (
                <CoachEmptyState
                  embedded={embedded}
                  hasJd={activeConversation?.has_jd}
                  coachMode={coachMode}
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
                    onUseModel={(modelId) => {
                      if (!models.some((model) => model.id === modelId)) return;
                      setSelectedModel(modelId);
                      storeModelId(modelId);
                    }}
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
                    model_served: activeRoute?.model_served,
                    requested_model: activeRoute?.requested_model,
                    fallback_used: activeRoute?.fallback_used,
                    fallback_reason: activeRoute?.fallback_reason,
                    reasoning_effort: reasoningEffort,
                  }}
                  streaming
                  defaultExpanded
                />
              )}

              {streaming && !streamText && (
                <CoachTypingIndicator searchingWeb={searchingWeb} />
              )}
            </div>
          </div>

          <div className="coach-composer-fade absolute inset-x-0 bottom-[7.5rem] h-8 sm:bottom-[8rem]" aria-hidden />

          {error && (
            <div className="shrink-0 px-2 sm:px-3">
              <p
                className="coach-thread-inner mx-auto rounded-xl border px-3 py-2 text-sm"
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
            reasoningEffort={reasoningEffort}
            onReasoningEffortChange={(effort) => {
              setReasoningEffort(effort);
              window.localStorage.setItem(REASONING_EFFORT_KEY, effort);
            }}
            answerLength={answerLength}
            onAnswerLengthChange={(length) => {
              setAnswerLength(length);
              window.localStorage.setItem(ANSWER_LENGTH_KEY, length);
            }}
            webSearchMode={webSearchMode}
            onWebSearchModeChange={(mode) => {
              setWebSearchMode(mode);
              window.localStorage.setItem(WEB_SEARCH_MODE_KEY, mode);
            }}
            searchingWeb={searchingWeb}
            textareaRef={textareaRef}
            placeholder={
              coachMode === "buddy"
                ? "Talk to your technical buddy…"
                : coachMode === "communication"
                  ? "Practise an answer…"
                  : "Message your coach…"
            }
          />
        </div>
      </div>

      {!embedded && !fullscreen && toolsOpen && (
        <div
          className="hidden w-72 shrink-0 overflow-y-auto border-l lg:block"
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
