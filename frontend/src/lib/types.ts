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
  model_served?: string;
  provider_served?: string;
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
  is_base?: boolean;
  source_filename?: string;
  created_at?: string;
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

export interface CoachModel {
  id: string;
  label: string;
  provider: string;
  provider_label: string;
  is_default: boolean;
}

export interface ChatMessageMeta {
  model_served?: string;
  provider_served?: string;
}

export interface InterviewQuestion {
  id?: number;
  text: string;
  category: string;
  tip?: string;
}

export interface InterviewTurn {
  id: number;
  session_id: number;
  question_index: number;
  role: "candidate" | "feedback" | "followup" | "followup_reply";
  content: string;
  scores: Record<string, unknown>;
  created_at: string;
}

export interface InterviewSessionSummary {
  overall_score?: number | string;
  strengths?: string[];
  priority_improvements?: string[];
  recurring_weaknesses?: string[];
  skill_pointers?: string[];
  next_steps?: string[];
  per_question?: Array<{
    question?: string;
    score?: number | string;
    key_feedback?: string;
  }>;
}

export interface InterviewSession {
  id: number;
  job_id: number | null;
  focus: string;
  difficulty: string;
  status: "active" | "completed" | string;
  questions: InterviewQuestion[];
  current_index: number;
  summary: InterviewSessionSummary;
  recurring_weaknesses: string[];
  model_id: string;
  created_at: string;
  updated_at: string;
  turns: InterviewTurn[];
}

export const INTERVIEW_FOCUS = [
  { id: "mixed", label: "Mixed", desc: "Behavioral + technical + resume" },
  { id: "behavioral", label: "Behavioral", desc: "STAR stories & soft skills" },
  { id: "technical_ml", label: "ML / AI Technical", desc: "Models, metrics, ML concepts" },
  { id: "system_design", label: "System Design", desc: "Pipelines, scale, production ML" },
  { id: "resume_deep", label: "Resume Deep-Dive", desc: "Your projects & experience" },
] as const;

export const INTERVIEW_DIFFICULTY = [
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid-level" },
  { id: "senior", label: "Senior" },
] as const;
