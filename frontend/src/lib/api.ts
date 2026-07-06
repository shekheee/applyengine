import type {
  Application,
  ChatMessage,
  CoachModel,
  Job,
  Memory,
  Profile,
  Status,
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
      detail = data?.detail ?? JSON.stringify(data);
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
  listMessages: () => req<ChatMessage[]>("/api/chat/messages"),
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
    model?: string
  ): Promise<{
    user_message: ChatMessage;
    assistant_message: ChatMessage;
    provider_served?: string;
    model_served?: string;
  }> => {
    const form = new FormData();
    form.append("message", message);
    if (model) form.append("model", model);
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

  downloadResumePdf: async (): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(`${BASE}/api/resume/pdf`, {
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
};
