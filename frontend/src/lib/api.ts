import type { Application, Job, Profile, Status } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  base: BASE,

  health: () => req<{ status: string; llm_provider: string }>("/api/health"),

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
      body: form,
    });
    if (!res.ok) throw new Error(await res.text());
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
