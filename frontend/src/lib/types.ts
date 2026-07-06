export type Status = "saved" | "applied" | "interview" | "offer" | "rejected";

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface ChatAttachment {
  name: string;
  kind: "image" | "document";
  mime?: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  created_at: string;
}

export interface Memory {
  id: number;
  kind: string;
  content: string;
  created_at: string;
}

export interface Profile {
  id: number;
  name: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  raw_text: string;
  links: string[];
  skills: string[];
  experience: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  education: Record<string, unknown>[];
}

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  url: string;
  seniority: string;
  raw_text: string;
  summary: string;
  requirements: string[];
  keywords: string[];
}

export interface Application {
  id: number;
  job_id: number;
  profile_id: number;
  status: Status;
  fit_score: number | null;
  keyword_coverage: number | null;
  matched_keywords: string[];
  missing_keywords: string[];
  gap_analysis: string;
  tailored_resume: string;
  cover_letter: string;
  interview_prep: string;
  notes: string;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export const STATUSES: Status[] = [
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
];

export const STATUS_LABELS: Record<Status, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export interface PendingAttachment {
  file: File;
  preview?: string;
}
