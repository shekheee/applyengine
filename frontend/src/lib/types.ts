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
  conversation_id?: number | null;
  created_at: string;
  model_served?: string;
  provider_served?: string;
}

export interface Conversation {
  id: number;
  title: string;
  job_id: number | null;
  job_title: string;
  job_company: string;
  has_jd: boolean;
  jd_preview: string;
  message_preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
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
  topic_scores?: Record<string, number | string>;
  per_question?: Array<{
    question?: string;
    score?: number | string;
    key_feedback?: string;
    topic?: string;
  }>;
}

export interface InterviewSession {
  id: number;
  job_id: number | null;
  focus: string;
  difficulty: string;
  curriculum_topic?: string;
  status: "active" | "completed" | string;
  questions: InterviewQuestion[];
  current_index: number;
  summary: InterviewSessionSummary;
  recurring_weaknesses: string[];
  overall_score?: number | null;
  model_id: string;
  created_at: string;
  updated_at: string;
  turns: InterviewTurn[];
}

export const INTERVIEW_FOCUS = [
  { id: "mixed", label: "Mixed", desc: "Balanced practice across question types" },
  { id: "behavioral", label: "Behavioral", desc: "STAR stories & situational judgment" },
  { id: "role_technical", label: "Role-specific depth", desc: "Methods & skills for your field" },
  { id: "case_study", label: "Case / scenario", desc: "Structured problem-solving scenarios" },
  { id: "leadership_stakeholder", label: "Leadership & stakeholders", desc: "Influence, alignment, sponsorship" },
  { id: "resume_deep_dive", label: "Resume deep-dive", desc: "Your projects & experience" },
] as const;

const LEGACY_FOCUS_LABELS: Record<string, string> = {
  technical_ml: "Role-specific depth",
  system_design: "Case / scenario",
  resume_deep: "Resume deep-dive",
};

export function interviewFocusLabel(id: string): string {
  return INTERVIEW_FOCUS.find((f) => f.id === id)?.label ?? LEGACY_FOCUS_LABELS[id] ?? id;
}

export const INTERVIEW_DIFFICULTY = [
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid-level" },
  { id: "senior", label: "Senior" },
] as const;

export interface DeliveryMetrics {
  words_per_minute: number;
  word_count: number;
  filler_count: number;
  filler_rate_per_100: number;
  filler_breakdown: Record<string, number>;
  pause_count: number;
  longest_pause_ms: number;
  pauses: Array<{ duration_ms: number; after_word?: string; type?: string }>;
  duration_seconds: number;
  observations: string[];
}

export interface TranscribeResult {
  text: string;
  duration_seconds: number;
  delivery: DeliveryMetrics;
  model: string;
}

export interface ProgressTheme {
  text: string;
  count: number;
}

export interface InterviewProgress {
  total_sessions: number;
  completed_sessions: number;
  scored_sessions: number;
  average_score: number | null;
  best_score: number | null;
  worst_score: number | null;
  score_over_time: Array<{
    session_id: number;
    date: string;
    score: number;
    focus: string;
    difficulty: string;
    curriculum_topic?: string;
  }>;
  focus_averages: Record<string, number>;
  best_focus_area: string | null;
  weakest_focus_area: string | null;
  topic_averages?: Record<string, number>;
  best_topic_area?: string | null;
  weakest_topic_area?: string | null;
  topic_labels?: Record<string, string>;
  recurring_themes: ProgressTheme[];
  skill_pointers: ProgressTheme[];
  top_strengths: ProgressTheme[];
  activity_streak_days: number;
  trend: "stable" | "improving" | "declining";
}

export interface CurriculumTopic {
  id: string;
  order: number;
  title: string;
  tagline: string;
  subtopics: string[];
  senior_signals: string[];
  weak_answer_patterns: string[];
  strong_answer_patterns: string[];
}

export interface InterviewCurriculum {
  track_id: string;
  track_title: string;
  track_description: string;
  topics: CurriculumTopic[];
  ml_profile_detected: boolean;
}

const CURRICULUM_TOPIC_LABELS: Record<string, string> = {
  all: "All AI/ML topics",
  ml_classics: "ML classics",
  llm_fundamentals: "LLM fundamentals",
  rag: "RAG",
  agent_fundamentals: "Agent fundamentals",
  orchestration_protocols: "Orchestration & protocols",
  eval_failure_modes: "Evaluation & failure modes",
  system_design_agentic: "System design (agentic/LLM)",
  cost_latency: "Cost & latency tradeoffs",
};

export function curriculumTopicLabel(id: string): string {
  return CURRICULUM_TOPIC_LABELS[id] ?? id.replace(/_/g, " ");
}
