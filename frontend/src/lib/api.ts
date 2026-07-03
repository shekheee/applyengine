import type {
  Application,
  ChatMessage,
  Job,
  Memory,
  Profile,
  Status,
  User,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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

  health: () => req<{ status: string; llm_provider: string }>("/api/health"),

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
  listMessages: () => req<ChatMessage[]>("/api/chat/messages"),
  sendMessage: (message: string) =>
    req<ChatMessage>("/api/chat/messages", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  listMemories: () => req<Memory[]>("/api/chat/memories"),
  deleteMemory: (id: number) =>
    req<{ ok: boolean }>(`/api/chat/memories/${id}`, { method: "DELETE" }),
  applyToResume: () =>
    req<Profile>("/api/chat/apply-to-resume", { method: "POST" }),

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
      throw new ApiError(res.status, await res.text());
    }
    return res.json();
  },

  latestProfile: () => req<Profile>("/api/profiles/latest"),
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
