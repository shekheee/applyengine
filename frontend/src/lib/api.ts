import type {
  Application,
  ChatMessage,
  CoachModel,
  Conversation,
  DesignedResumePreview,
  ResumeDesignResult,
  ResumeVersion,
  InterviewCurriculum,
  InterviewProgress,
  InterviewSession,
  InterviewTurn,
  Job,
  Memory,
  Profile,
  Status,
  TranscribeResult,
  User,
} from "./types";

const PROD_API = "https://applyengine-api.onrender.com";

function resolveApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "applyengine.ajayshekhawat.uk" || host.endsWith(".vercel.app")) {
      return PROD_API;
    }
  }
  return "http://localhost:8000";
}

const BASE = resolveApiBase();
const TOKEN_KEY = "applyengine_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      const raw = data?.detail ?? data;
      detail =
        typeof raw === "string"
          ? raw
          : Array.isArray(raw)
            ? raw.map((x: { msg?: string }) => x.msg || JSON.stringify(x)).join("; ")
            : JSON.stringify(raw);
    } catch {
      detail = await res.text().catch(() => "");
    }
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,

  health: () =>
    req<{ status: string; llm_provider: string; chat_model?: string }>(
      "/api/health"
    ),

  // ---- Auth ----
  register: (body: {
    email: string;
    password: string;
    name?: string;
    signup_code?: string;
  }) =>
    req<{ access_token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (email: string, password: string) =>
    req<{ access_token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => req<User>("/api/auth/me"),

  // ---- Coach chat ----
  listCoachModels: () =>
    req<{ models: CoachModel[]; default_model: string }>("/api/chat/models"),

  listConversations: () => req<Conversation[]>("/api/chat/conversations"),

  createConversation: (body: {
    title?: string;
    job_id?: number | null;
    jd_text?: string;
  }) =>
    req<Conversation>("/api/chat/conversations", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getOrCreateApplicationConversation: (applicationId: number) =>
    req<Conversation>(`/api/chat/conversations/for-application/${applicationId}`, {
      method: "POST",
    }),

  renameConversation: (id: number, title: string) =>
    req<Conversation>(`/api/chat/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),

  deleteConversation: (id: number) =>
    req<{ ok: boolean }>(`/api/chat/conversations/${id}`, { method: "DELETE" }),

  listMessages: (conversationId?: number) =>
    req<ChatMessage[]>(
      conversationId != null
        ? `/api/chat/conversations/${conversationId}/messages`
        : "/api/chat/messages"
    ),
  sendMessage: (message: string, model?: string) =>
    req<ChatMessage>("/api/chat/messages", {
      method: "POST",
      body: JSON.stringify({ message, model: model || undefined }),
    }),
  sendMessageStream: async (
    message: string,
    files: File[],
    onToken: (token: string) => void,
    signal?: AbortSignal,
    model?: string,
    conversationId?: number
  ): Promise<{
    user_message: ChatMessage;
    assistant_message: ChatMessage;
    provider_served?: string;
    model_served?: string;
    conversation_id?: number;
  }> => {
    const form = new FormData();
    form.append("message", message);
    if (model) form.append("model", model);
    if (conversationId != null) form.append("conversation_id", String(conversationId));
    for (const f of files) form.append("files", f);

    const res = await fetch(`${BASE}/api/chat/messages/stream`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: form,
      signal,
    });
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail ?? JSON.stringify(data);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new ApiError(res.status, detail || `Request failed (${res.status})`);
    }
    if (!res.body) throw new ApiError(500, "No response stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: {
      user_message: ChatMessage;
      assistant_message: ChatMessage;
      provider_served?: string;
      model_served?: string;
      conversation_id?: number;
    } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;
        try {
          const evt = JSON.parse(payload) as {
            type: string;
            content?: string;
            detail?: string;
            user_message?: ChatMessage;
            assistant_message?: ChatMessage;
            provider_served?: string;
            model_served?: string;
            conversation_id?: number;
          };
          if (evt.type === "token" && evt.content) onToken(evt.content);
          if (evt.type === "done" && evt.user_message && evt.assistant_message) {
            result = {
              user_message: evt.user_message,
              assistant_message: {
                ...evt.assistant_message,
                provider_served: evt.provider_served,
                model_served: evt.model_served,
              },
              provider_served: evt.provider_served,
              model_served: evt.model_served,
              conversation_id: evt.conversation_id,
            };
          }
          if (evt.type === "error") {
            throw new ApiError(500, evt.detail || "Stream failed");
          }
        } catch (e) {
          if (e instanceof ApiError) throw e;
        }
      }
    }
    if (!result) throw new ApiError(500, "Stream ended without completion");
    return result;
  },

  editMessageStream: async (
    messageId: number,
    message: string,
    onToken: (token: string) => void,
    signal?: AbortSignal,
    model?: string
  ): Promise<{
    user_message: ChatMessage;
    assistant_message: ChatMessage;
    removed_message_ids: number[];
    provider_served?: string;
    model_served?: string;
  }> => {
    const res = await fetch(`${BASE}/api/chat/messages/${messageId}/edit/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ message, model: model || undefined }),
      signal,
    });
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail ?? JSON.stringify(data);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new ApiError(res.status, detail || `Request failed (${res.status})`);
    }
    if (!res.body) throw new ApiError(500, "No response stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: {
      user_message: ChatMessage;
      assistant_message: ChatMessage;
      removed_message_ids: number[];
      provider_served?: string;
      model_served?: string;
    } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;
        try {
          const evt = JSON.parse(payload) as {
            type: string;
            content?: string;
            detail?: string;
            user_message?: ChatMessage;
            assistant_message?: ChatMessage;
            removed_message_ids?: number[];
            provider_served?: string;
            model_served?: string;
          };
          if (evt.type === "token" && evt.content) onToken(evt.content);
          if (evt.type === "done" && evt.user_message && evt.assistant_message) {
            result = {
              user_message: evt.user_message,
              assistant_message: {
                ...evt.assistant_message,
                model_served: evt.model_served,
                provider_served: evt.provider_served,
              },
              removed_message_ids: evt.removed_message_ids ?? [],
              provider_served: evt.provider_served,
              model_served: evt.model_served,
            };
          }
          if (evt.type === "error") {
            throw new ApiError(500, evt.detail || "Stream failed");
          }
        } catch (e) {
          if (e instanceof ApiError) throw e;
        }
      }
    }
    if (!result) throw new ApiError(500, "Stream ended without completion");
    return result;
  },

  listMemories: () => req<Memory[]>("/api/chat/memories"),
  deleteMemory: (id: number) =>
    req<{ ok: boolean }>(`/api/chat/memories/${id}`, { method: "DELETE" }),
  applyToResume: () =>
    req<Profile>("/api/chat/apply-to-resume", { method: "POST" }),

  downloadResumePdf: async (opts?: {
    jobId?: number;
    versionId?: number;
    mode?: "designed" | "ats";
  }): Promise<{ blob: Blob; filename: string }> => {
    const params = new URLSearchParams();
    if (opts?.jobId) params.set("job_id", String(opts.jobId));
    if (opts?.versionId) params.set("version_id", String(opts.versionId));
    if (opts?.mode) params.set("mode", opts.mode);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${BASE}/api/resume/pdf${qs}`, {
      headers: { ...authHeaders() },
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail ?? JSON.stringify(data);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new ApiError(res.status, detail || `Request failed (${res.status})`);
    }
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || "resume.pdf";
    const blob = await res.blob();
    return { blob, filename };
  },

  listResumeVersions: () => req<ResumeVersion[]>("/api/resume/versions"),

  getResumeVersion: (id: number) => req<ResumeVersion>(`/api/resume/versions/${id}`),

  generateDesignedResume: async (jobId?: number, style?: string) => {
    const params = new URLSearchParams();
    if (jobId) params.set("job_id", String(jobId));
    if (style) params.set("style", style);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const result = await req<ResumeDesignResult>(`/api/resume/design${qs}`, {
      method: "POST",
    });
    if (!result.html_content && result.version_id) {
      try {
        const version = await req<ResumeVersion>(
          `/api/resume/versions/${result.version_id}`
        );
        result.html_content = version.html_content || "";
      } catch {
        /* preview loaded separately */
      }
    }
    return result;
  },

  downloadResumeDocx: async (opts?: {
    jobId?: number;
    versionId?: number;
  }): Promise<{ blob: Blob; filename: string }> => {
    const params = new URLSearchParams();
    if (opts?.jobId) params.set("job_id", String(opts.jobId));
    if (opts?.versionId) params.set("version_id", String(opts.versionId));
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${BASE}/api/resume/docx${qs}`, {
      headers: { ...authHeaders() },
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail ?? JSON.stringify(data);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new ApiError(res.status, detail || `Request failed (${res.status})`);
    }
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || "resume.docx";
    const blob = await res.blob();
    return { blob, filename };
  },

  createProfile: (raw_text: string) =>
    req<Profile>("/api/profiles", {
      method: "POST",
      body: JSON.stringify({ raw_text }),
    }),

  uploadProfile: async (file: File): Promise<Profile> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/api/profiles/upload`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: form,
    });
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      let detail = "";
      try {
        const data = await res.json();
        detail = typeof data?.detail === "string" ? data.detail : JSON.stringify(data);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new ApiError(res.status, detail || `Upload failed (${res.status})`);
    }
    return res.json();
  },

  latestProfile: () => req<Profile>("/api/profiles/latest"),
  baseProfile: () => req<Profile>("/api/profiles/base"),
  listProfiles: () => req<Profile[]>("/api/profiles"),

  createJob: (raw_text: string, url = "") =>
    req<Job>("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ raw_text, url }),
    }),
  getJob: (id: number) => req<Job>(`/api/jobs/${id}`),
  listJobs: () => req<Job[]>("/api/jobs"),

  createApplication: (job_id: number) =>
    req<Application>("/api/applications", {
      method: "POST",
      body: JSON.stringify({ job_id }),
    }),
  listApplications: () => req<Application[]>("/api/applications"),
  getApplication: (id: number) => req<Application>(`/api/applications/${id}`),
  setStatus: (id: number, status: Status) =>
    req<Application>(`/api/applications/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  setNotes: (id: number, notes: string) =>
    req<Application>(`/api/applications/${id}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    }),
  generate: (application_id: number, what: string[]) =>
    req<Application>("/api/generate", {
      method: "POST",
      body: JSON.stringify({ application_id, what }),
    }),
  exportUrl: (id: number, doc: "resume" | "cover_letter") =>
    `${BASE}/api/applications/${id}/export/${doc}`,

  // ---- Interview Practice ----
  getInterviewCurriculum: () => req<InterviewCurriculum>("/api/interview/curriculum"),

  listInterviewSessions: () =>
    req<InterviewSession[]>("/api/interview/sessions"),

  getInterviewSession: (id: number) =>
    req<InterviewSession>(`/api/interview/sessions/${id}`),

  createInterviewSession: (body: {
    focus?: string;
    difficulty?: string;
    job_id?: number | null;
    model?: string;
    curriculum_topic?: string;
  }) =>
    req<InterviewSession>("/api/interview/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  submitInterviewAnswer: (
    sessionId: number,
    answer: string,
    opts?: { question_index?: number; model?: string }
  ) =>
    req<InterviewTurn>(`/api/interview/sessions/${sessionId}/answer`, {
      method: "POST",
      body: JSON.stringify({
        answer,
        question_index: opts?.question_index,
        model: opts?.model,
      }),
    }),

  submitInterviewAnswerStream: async (
    sessionId: number,
    answer: string,
    onToken: (token: string) => void,
    opts?: { question_index?: number; model?: string; signal?: AbortSignal }
  ): Promise<{ feedback: Record<string, unknown>; turn: InterviewTurn }> => {
    const res = await fetch(
      `${BASE}/api/interview/sessions/${sessionId}/answer/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          answer,
          question_index: opts?.question_index,
          model: opts?.model,
        }),
        signal: opts?.signal,
      }
    );
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail ?? JSON.stringify(data);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new ApiError(res.status, detail || `Request failed (${res.status})`);
    }
    if (!res.body) throw new ApiError(500, "No response stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: { feedback: Record<string, unknown>; turn: InterviewTurn } | null =
      null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;
        try {
          const evt = JSON.parse(payload) as {
            type: string;
            content?: string;
            detail?: string;
            feedback?: Record<string, unknown>;
            turn?: InterviewTurn;
          };
          if (evt.type === "token" && evt.content) onToken(evt.content);
          if (evt.type === "done" && evt.feedback && evt.turn) {
            result = { feedback: evt.feedback, turn: evt.turn };
          }
          if (evt.type === "error") {
            throw new ApiError(500, evt.detail || "Stream failed");
          }
        } catch (e) {
          if (e instanceof ApiError) throw e;
        }
      }
    }
    if (!result) throw new ApiError(500, "Stream ended without completion");
    return result;
  },

  interviewFollowupStream: async (
    sessionId: number,
    message: string,
    onToken: (token: string) => void,
    opts?: { question_index?: number; model?: string; signal?: AbortSignal }
  ): Promise<string> => {
    const res = await fetch(
      `${BASE}/api/interview/sessions/${sessionId}/followup/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          message,
          question_index: opts?.question_index,
          model: opts?.model,
        }),
        signal: opts?.signal,
      }
    );
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail ?? JSON.stringify(data);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new ApiError(res.status, detail || `Request failed (${res.status})`);
    }
    if (!res.body) throw new ApiError(500, "No response stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;
        try {
          const evt = JSON.parse(payload) as {
            type: string;
            content?: string;
            detail?: string;
          };
          if (evt.type === "token" && evt.content) {
            onToken(evt.content);
            content += evt.content;
          }
          if (evt.type === "done" && evt.content) content = evt.content;
          if (evt.type === "error") {
            throw new ApiError(500, evt.detail || "Stream failed");
          }
        } catch (e) {
          if (e instanceof ApiError) throw e;
        }
      }
    }
    return content;
  },

  nextInterviewQuestion: (sessionId: number) =>
    req<InterviewSession>(`/api/interview/sessions/${sessionId}/next`, {
      method: "POST",
    }),

  completeInterviewSession: (sessionId: number, model?: string) =>
    req<InterviewSession>(`/api/interview/sessions/${sessionId}/complete`, {
      method: "POST",
      body: JSON.stringify({ model: model || undefined }),
    }),

  getInterviewProgress: () => req<InterviewProgress>("/api/interview/progress"),

  transcribeInterviewAudio: async (
    blob: Blob,
    mime: string,
    durationSeconds: number
  ): Promise<TranscribeResult> => {
    const form = new FormData();
    form.append("file", blob, `recording.${mime.includes("mp4") ? "m4a" : "webm"}`);
    form.append("duration", String(durationSeconds));
    const res = await fetch(`${BASE}/api/interview/transcribe`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: form,
    });
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.detail ?? JSON.stringify(data);
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new ApiError(res.status, detail || `Transcription failed (${res.status})`);
    }
    return res.json() as Promise<TranscribeResult>;
  },
};
