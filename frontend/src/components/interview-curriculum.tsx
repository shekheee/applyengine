"use client";

import { useState } from "react";
import type { CurriculumTopic, InterviewCurriculum } from "@/lib/types";
import { Badge, Card, cn } from "@/components/ui";

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{curriculum.track_title} prep track</p>
          <p className="text-xs text-[var(--muted)]">{curriculum.track_description}</p>
        </div>
        <button
          type="button"
          onClick={onToggleStudyGuide}
          className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-[var(--panel-2)]"
          style={{ borderColor: "var(--border)" }}
        >
          {showStudyGuide ? "Hide study guide" : "Study guide"}
        </button>
      </div>

      {curriculum.ml_profile_detected && (
        <Badge tone="primary">Recommended for your profile</Badge>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((opt) => (
          <button
            key={opt.id || "none"}
            type="button"
            onClick={() => onSelectTopic(opt.id)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left transition-colors",
              selectedTopic === opt.id
                ? "border-[var(--primary)] bg-[var(--primary)]/10"
                : "border-[var(--border)] hover:bg-[var(--panel-2)]"
            )}
          >
            <span className="block text-sm font-medium">{opt.title}</span>
            <span className="block text-xs text-[var(--muted)]">{opt.desc}</span>
          </button>
        ))}
      </div>

      {showStudyGuide && (
        <Card className="max-h-[420px] space-y-4 overflow-y-auto">
          {curriculum.topics.map((t) => (
            <TopicStudyCard key={t.id} topic={t} />
          ))}
        </Card>
      )}
    </div>
  );
}

function TopicStudyCard({ topic }: { topic: CurriculumTopic }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <div>
          <p className="text-sm font-semibold">
            {topic.order}. {topic.title}
          </p>
          <p className="text-xs text-[var(--muted)]">{topic.tagline}</p>
        </div>
        <span className="text-xs text-[var(--muted)]">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-xs leading-relaxed">
          <Section title="Subtopics" items={topic.subtopics} />
          <Section title="Senior signals" items={topic.senior_signals} tone="green" />
          <Section title="Strong answers" items={topic.strong_answer_patterns} />
          <Section title="Weak patterns to avoid" items={topic.weak_answer_patterns} tone="warn" />
        </div>
      )}
    </div>
  );
}

function Section({
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
          "mb-1 font-medium",
          tone === "green" && "text-green-400",
          tone === "warn" && "text-amber-300"
        )}
      >
        {title}
      </p>
      <ul className="list-disc space-y-0.5 pl-4 text-[var(--muted)]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
