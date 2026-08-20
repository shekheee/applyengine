import type {
  Application,
  AudioDeliveryAnalysis,
  ChatMessage,
  CoachModel,
  CoachMode,
  Conversation,
  DeliveryMetrics,
  ClientAudioMetrics,
  ResumeDesignResult,
  ResumeVersion,
  InterviewCurriculum,
  InterviewProgress,
  InterviewSession,
  InterviewTurn,
  SkillArtifact,
  SkillDefinition,
  Job,
  Memory,
  Profile,
  ReasoningEffort,
  SocialMessage,
  SocialProject,
  SocialPublishingStatus,
  Status,
  TranscribeResult,
  User,
  WebSearchMode,
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
  sendMessage: (
    message: string,
    model?: string,
    reasoningEffort = "medium",
    answerLength = "normal",
    coachMode: CoachMode = "career"
  ) =>
    req<ChatMessage>("/api/chat/messages", {
      method: "POST",
      body: JSON.stringify({
        message,
        model: model || undefined,
        reasoning_effort: reasoningEffort,
        answer_length: answerLength,
        coach_mode: coachMode,
      }),
    }),
  sendMessageStream: async (
    message: string,
    files: File[],
    onToken: (token: string) => void,
    signal?: AbortSignal,
    model?: string,
    conversationId?: number,
    webSearchMode: WebSearchMode = "auto",
    reasoningEffort = "medium",
    answerLength = "normal",
    coachMode: CoachMode = "career",
    delivery?: DeliveryMetrics,
    onSearchStatus?: (searching: boolean) => void,
    onRoute?: (route: {
      requested_model?: string;
      model_served?: string;
      provider_served?: string;
      fallback_used?: boolean;
      fallback_reason?: string;
    }) => void
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
    form.append("web_search_mode", webSearchMode);
    form.append("reasoning_effort", reasoningEffort);
    form.append("answer_length", answerLength);
    form.append("coach_mode", coachMode);
    if (delivery) form.append("delivery_json", JSON.stringify(delivery));
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
            status?: string;
            requested_model?: string;
            fallback_used?: boolean;
            fallback_reason?: string;
            reasoning_effort?: ChatMessage["reasoning_effort"];
          };
          if (evt.type === "token" && evt.content) onToken(evt.content);
          if (evt.type === "search") onSearchStatus?.(evt.status === "searching");
          if (evt.type === "route") onRoute?.(evt);
          if (evt.type === "done" && evt.user_message && evt.assistant_message) {
            onSearchStatus?.(false);
            result = {
              user_message: evt.user_message,
              assistant_message: {
                ...evt.assistant_message,
                provider_served: evt.provider_served,
                model_served: evt.model_served,
                requested_model: evt.requested_model,
                fallback_used: evt.fallback_used,
                fallback_reason: evt.fallback_reason,
                reasoning_effort: evt.reasoning_effort,
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
    model?: string,
    webSearchMode: WebSearchMode = "auto",
    reasoningEffort = "medium",
    answerLength = "normal",
    coachMode: CoachMode = "career",
    onSearchStatus?: (searching: boolean) => void,
    onRoute?: (route: Partial<ChatMessage>) => void
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
      body: JSON.stringify({
        message,
        model: model || undefined,
        web_search_mode: webSearchMode,
        reasoning_effort: reasoningEffort,
        answer_length: answerLength,
        coach_mode: coachMode,
      }),
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
            status?: string;
            requested_model?: string;
            fallback_used?: boolean;
            fallback_reason?: string;
            reasoning_effort?: ChatMessage["reasoning_effort"];
          };
          if (evt.type === "token" && evt.content) onToken(evt.content);
          if (evt.type === "search") onSearchStatus?.(evt.status === "searching");
          if (evt.type === "route") onRoute?.(evt);
          if (evt.type === "done" && evt.user_message && evt.assistant_message) {
            onSearchStatus?.(false);
            result = {
              user_message: evt.user_message,
              assistant_message: {
                ...evt.assistant_message,
                model_served: evt.model_served,
                provider_served: evt.provider_served,
                requested_model: evt.requested_model,
                fallback_used: evt.fallback_used,
                fallback_reason: evt.fallback_reason,
                reasoning_effort: evt.reasoning_effort,
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

  // ---- Social Studio ----
  listSocialProjects: () => req<SocialProject[]>("/api/social/projects"),
  createSocialProject: (body: {
    platform: "linkedin" | "medium";
    title?: string;
    settings?: Record<string, string>;
  }) =>
    req<SocialProject>("/api/social/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getSocialProject: (id: number) =>
    req<SocialProject>(`/api/social/projects/${id}`),
  updateSocialProject: (
    id: number,
    body: Partial<Pick<SocialProject, "title" | "status" | "settings" | "current_content">>
  ) =>
    req<SocialProject>(`/api/social/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSocialProject: (id: number) =>
    req<{ ok: boolean }>(`/api/social/projects/${id}`, { method: "DELETE" }),
  listSocialMessages: (id: number) =>
    req<SocialMessage[]>(`/api/social/projects/${id}/messages`),
  socialPublishingStatus: () =>
    req<SocialPublishingStatus>("/api/social/publishing-status"),
  sendSocialMessageStream: async (
    projectId: number,
    message: string,
    onToken: (token: string) => void,
    signal?: AbortSignal,
    model?: string
  ): Promise<{
    user_message: SocialMessage;
    assistant_message: SocialMessage;
    project: SocialProject;
    provider_served?: string;
    model_served?: string;
  }> => {
    const res = await fetch(`${BASE}/api/social/projects/${projectId}/messages/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
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
      user_message: SocialMessage;
      assistant_message: SocialMessage;
      project: SocialProject;
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
        const raw = line.slice(6).trim();
        if (!raw) continue;
        const event = JSON.parse(raw) as {
          type: string;
          content?: string;
          detail?: string;
          user_message?: SocialMessage;
          assistant_message?: SocialMessage;
          project?: SocialProject;
          provider_served?: string;
          model_served?: string;
        };
        if (event.type === "token" && event.content) onToken(event.content);
        if (
          event.type === "done" &&
          event.user_message &&
          event.assistant_message &&
          event.project
        ) {
          result = {
            user_message: event.user_message,
            assistant_message: {
              ...event.assistant_message,
              provider_served: event.provider_served,
              model_served: event.model_served,
            },
            project: event.project,
            provider_served: event.provider_served,
            model_served: event.model_served,
          };
        }
        if (event.type === "error") {
          throw new ApiError(500, event.detail || "Social draft stream failed");
        }
      }
    }
    if (!result) throw new ApiError(500, "Stream ended without completion");
    return result;
  },

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

  // ---- Skills and artifacts ----
  listSkills: () => req<SkillDefinition[]>("/api/skills"),

  listSkillArtifacts: (skillId?: string) => {
    const query = skillId ? `?skill_id=${encodeURIComponent(skillId)}` : "";
    return req<SkillArtifact[]>(`/api/skills/artifacts${query}`);
  },

  createSkillArtifact: (body: {
    skill_id: string;
    template: string;
    title?: string;
    brief: string;
    job_id?: number | null;
    model?: string;
    reasoning_effort?: ReasoningEffort;
  }) =>
    req<SkillArtifact>("/api/skills/artifacts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  reviseSkillArtifact: (
    artifactId: number,
    body: {
      instruction: string;
      model?: string;
      reasoning_effort?: ReasoningEffort;
    }
  ) =>
    req<SkillArtifact>(`/api/skills/artifacts/${artifactId}/revise`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  downloadSkillArtifact: async (
    artifactId: number,
    format: "docx" | "pdf" | "pptx"
  ): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(
      `${BASE}/api/skills/artifacts/${artifactId}/download?format=${format}`,
      { headers: { ...authHeaders() }, cache: "no-store" }
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
      throw new ApiError(res.status, detail || `Download failed (${res.status})`);
    }
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    return { blob: await res.blob(), filename: match?.[1] || `artifact.${format}` };
  },

  createProfile: (raw_text: string) =>
    req<Profile>("/api/profiles", {
      method: "POST",
      body: JSON.stringify({ raw_text }),
    }),

  uploadProfile: async (file: File, onUploadComplete?: () => void): Promise<Profile> => {
    if (onUploadComplete && typeof XMLHttpRequest !== "undefined") {
      return new Promise<Profile>((resolve, reject) => {
        const form = new FormData();
        form.append("file", file);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${BASE}/api/profiles/upload`);
        const token = getToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.addEventListener("load", onUploadComplete);
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText) as Profile);
            } catch {
              reject(new ApiError(xhr.status, "Invalid upload response"));
            }
            return;
          }
          if (xhr.status === 401) setToken(null);
          let detail = "";
          try {
            const data = JSON.parse(xhr.responseText);
            detail =
              typeof data?.detail === "string" ? data.detail : JSON.stringify(data?.detail ?? data);
          } catch {
            detail = xhr.responseText;
          }
          reject(new ApiError(xhr.status, detail || `Upload failed (${xhr.status})`));
        });
        xhr.addEventListener("error", () =>
          reject(new ApiError(0, "Upload failed. Check your connection and try again."))
        );
        xhr.send(form);
      });
    }

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
  analyzeFit: (id: number) =>
    req<Application>(`/api/applications/${id}/analyze-fit`, {
      method: "POST",
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
    mode?: "text" | "live";
    behavior_mode?: "simulation" | "coach";
    interviewer_persona?: string;
    captions?: "progressive" | "hidden";
  }) =>
    req<InterviewSession>("/api/interview/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  submitInterviewAnswer: (
    sessionId: number,
    answer: string,
    opts?: { question_index?: number; model?: string; request_id?: string; delivery?: DeliveryMetrics }
  ) =>
    req<InterviewTurn>(`/api/interview/sessions/${sessionId}/answer`, {
      method: "POST",
      body: JSON.stringify({
        answer,
        question_index: opts?.question_index,
        model: opts?.model,
        request_id: opts?.request_id,
        delivery: opts?.delivery,
      }),
    }),

  submitInterviewAnswerStream: async (
    sessionId: number,
    answer: string,
    onToken: (token: string) => void,
    opts?: {
      question_index?: number;
      model?: string;
      signal?: AbortSignal;
      request_id?: string;
      delivery?: DeliveryMetrics;
    }
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
          request_id: opts?.request_id,
          delivery: opts?.delivery,
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

  updateInterviewSession: (
    sessionId: number,
    body: { title?: string; archived?: boolean }
  ) =>
    req<InterviewSession>(`/api/interview/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteInterviewSession: (sessionId: number) =>
    req<void>(`/api/interview/sessions/${sessionId}`, { method: "DELETE" }),

  transcribeInterviewAudio: async (
    blob: Blob,
    mime: string,
    durationSeconds: number,
    clientMetrics?: ClientAudioMetrics
  ): Promise<TranscribeResult> => {
    const form = new FormData();
    form.append("file", blob, `recording.${mime.includes("mp4") ? "m4a" : "webm"}`);
    form.append("duration", String(durationSeconds));
    form.append("client_metrics", JSON.stringify(clientMetrics ?? {}));
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

  analyzeInterviewAudio: async (
    blob: Blob,
    mime: string,
    durationSeconds: number,
    transcript: string,
    clientMetrics?: ClientAudioMetrics
  ): Promise<AudioDeliveryAnalysis> => {
    const form = new FormData();
    form.append("file", blob, `recording.${mime.includes("mp4") ? "m4a" : "webm"}`);
    form.append("duration", String(durationSeconds));
    form.append("transcript", transcript);
    form.append("client_metrics", JSON.stringify(clientMetrics ?? {}));
    const res = await fetch(`${BASE}/api/interview/analyze-audio`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: form,
    });
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      throw new ApiError(res.status, `Audio analysis failed (${res.status})`);
    }
    return res.json() as Promise<AudioDeliveryAnalysis>;
  },

  updateInterviewTurnDelivery: (
    sessionId: number,
    requestId: string,
    delivery: DeliveryMetrics
  ) =>
    req<InterviewTurn>(
      `/api/interview/sessions/${sessionId}/turns/${encodeURIComponent(requestId)}/delivery`,
      { method: "PATCH", body: JSON.stringify({ delivery }) }
    ),

  liveInterviewTurnStream: async (
    sessionId: number,
    onToken: (token: string) => void,
    opts?: {
      candidate_answer?: string;
      model?: string;
      signal?: AbortSignal;
      request_id?: string;
      delivery?: DeliveryMetrics;
      candidate_intent?: "answer" | "clarification" | "candidate_question";
    }
  ): Promise<{
    speech: string;
    meta: Record<string, unknown>;
    end_interview: boolean;
    turn: InterviewTurn;
    current_index: number;
  }> => {
    const res = await fetch(
      `${BASE}/api/interview/sessions/${sessionId}/live/turn/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          candidate_answer: opts?.candidate_answer,
          model: opts?.model,
          request_id: opts?.request_id,
          delivery: opts?.delivery,
          candidate_intent: opts?.candidate_intent,
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
    let result: {
      speech: string;
      meta: Record<string, unknown>;
      end_interview: boolean;
      turn: InterviewTurn;
      current_index: number;
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
            speech?: string;
            meta?: Record<string, unknown>;
            end_interview?: boolean;
            turn?: InterviewTurn;
            current_index?: number;
          };
          if (evt.type === "token" && evt.content) onToken(evt.content);
          if (evt.type === "done" && evt.speech && evt.turn) {
            result = {
              speech: evt.speech,
              meta: evt.meta ?? {},
              end_interview: !!evt.end_interview,
              turn: evt.turn,
              current_index: evt.current_index ?? 0,
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

  liveInterviewTts: async (sessionId: number, text: string): Promise<Blob> => {
    const res = await fetch(`${BASE}/api/interview/sessions/${sessionId}/live/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ text }),
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
      throw new ApiError(res.status, detail || `TTS failed (${res.status})`);
    }
    return res.blob();
  },
};
