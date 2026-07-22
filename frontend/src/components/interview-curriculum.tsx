"use client";

import { useState } from "react";
import type { CurriculumTopic, InterviewCurriculum } from "@/lib/types";
import { Badge, cn } from "@/components/ui";
import { IconBook, IconCheck } from "@/components/interview/icons";

export function InterviewCurriculumPanel({
  curriculum,
  selectedTopic,
  onSelectTopic,
  showStudyGuide,
  onToggleStudyGuide,
}: {
  curriculum: InterviewCurriculum | null;
  selectedTopic: string;
  onSelectTopic: (topicId: string) => void;
  showStudyGuide: boolean;
  onToggleStudyGuide: () => void;
}) {
  if (!curriculum) return null;

  const options: Array<{ id: string; title: string; desc: string }> = [
    { id: "", title: "None (general practice)", desc: "Use focus area only — no AI/ML track" },
    { id: "all", title: "All 8 topics", desc: "Mixed drill across the full curriculum" },
    ...curriculum.topics.map((t) => ({
      id: t.id,
      title: `${t.order}. ${t.title}`,
      desc: t.tagline,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{curriculum.track_title}</p>
            {curriculum.ml_profile_detected && (
              <Badge tone="primary">Recommended for your profile</Badge>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            {curriculum.track_description}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleStudyGuide}
          className={cn(
            "btn-interactive inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none",
            showStudyGuide
              ? "border-[var(--primary)] bg-[var(--primary)]/12 text-[var(--primary-2)]"
              : "border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--border-strong)]"
          )}
        >
          <IconBook className="h-3.5 w-3.5" />
          {showStudyGuide ? "Hide study guide" : "Study guide"}
        </button>
      </div>

      <div
        className="grid gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-label="AI/ML curriculum topic"
      >
        {options.map((opt) => {
          const selected = selectedTopic === opt.id;
          return (
            <button
              key={opt.id || "none"}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelectTopic(opt.id)}
              className={cn(
                "group relative rounded-[var(--radius-md)] border px-3 py-3 text-left transition-all motion-reduce:transition-none",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--primary)_60%,transparent)]",
                selected
                  ? "border-[color-mix(in_srgb,var(--primary)_55%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_10%,var(--panel-2))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_20%,transparent)]"
                  : "border-[var(--border)] bg-[var(--panel-2)]/40 hover:border-[var(--border-strong)] hover:bg-[var(--panel-2)]"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-sm font-medium leading-snug">{opt.title}</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">{opt.desc}</span>
                </div>
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all motion-reduce:transition-none",
                    selected
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-[var(--border)] opacity-0 group-hover:opacity-40"
                  )}
                  aria-hidden
                >
                  {selected && <IconCheck className="h-3 w-3" strokeWidth={2.5} />}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {showStudyGuide && (
        <div
          className="max-h-[min(420px,50vh)] space-y-3 overflow-y-auto overscroll-contain rounded-[var(--radius-lg)] border bg-[var(--panel-2)]/50 p-3 motion-reduce:animate-none animate-fade-up"
          style={{ borderColor: "var(--border)" }}
        >
          {curriculum.topics.map((t) => (
            <TopicStudyCard key={t.id} topic={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TopicStudyCard({ topic }: { topic: CurriculumTopic }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel)]"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--panel-2)] motion-reduce:transition-none"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {topic.order}. {topic.title}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{topic.tagline}</p>
        </div>
        <span
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs transition-transform motion-reduce:transition-none",
            open && "rotate-180",
            "border-[var(--border)] text-[var(--muted)]"
          )}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-[var(--border)] px-4 py-3 text-xs leading-relaxed motion-reduce:animate-none animate-fade-up">
          <StudySection title="Subtopics" items={topic.subtopics} />
          <StudySection title="Senior signals" items={topic.senior_signals} tone="green" />
          <StudySection title="Strong answers" items={topic.strong_answer_patterns} />
          <StudySection title="Weak patterns to avoid" items={topic.weak_answer_patterns} tone="warn" />
        </div>
      )}
    </div>
  );
}

function StudySection({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "green" | "warn";
}) {
  return (
    <div>
      <p
        className={cn(
          "mb-1.5 text-[10px] font-semibold uppercase tracking-wider",
          tone === "green" && "text-emerald-400",
          tone === "warn" && "text-amber-300",
          tone === "default" && "text-[var(--muted)]"
        )}
      >
        {title}
      </p>
      <ul className="space-y-1 text-[var(--text-secondary)]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--muted-2)]" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
