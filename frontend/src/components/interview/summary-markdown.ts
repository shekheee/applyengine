import type { InterviewSession } from "@/lib/types";
import { curriculumTopicLabel } from "@/lib/types";

export function summaryMarkdown(summary: InterviewSession["summary"]): string {
  const lines = [
    `## Session complete · **${summary.overall_score ?? "—"}/10**`,
    "",
  ];
  if (summary.strengths?.length) {
    lines.push("### Top strengths");
    summary.strengths.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (summary.priority_improvements?.length) {
    lines.push("### Priority improvements");
    summary.priority_improvements.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (summary.recurring_weaknesses?.length) {
    lines.push("### Recurring patterns");
    summary.recurring_weaknesses.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (summary.skill_pointers?.length) {
    lines.push("### Skill enhancement pointers");
    summary.skill_pointers.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (summary.next_steps?.length) {
    lines.push("### Next steps");
    summary.next_steps.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (summary.per_question?.length) {
    lines.push("### Question scores");
    summary.per_question.forEach((pq) => {
      const topicNote = pq.topic ? ` · ${curriculumTopicLabel(pq.topic)}` : "";
      lines.push(
        `- **${pq.score ?? "—"}/10**${topicNote} — ${(pq.question ?? "").slice(0, 80)}… _${pq.key_feedback ?? ""}_`
      );
    });
  }
  if (summary.topic_scores && Object.keys(summary.topic_scores).length > 0) {
    lines.push("");
    lines.push("### AI/ML topic scores");
    Object.entries(summary.topic_scores).forEach(([tid, sc]) => {
      lines.push(`- **${curriculumTopicLabel(tid)}:** ${sc}/10`);
    });
  }
  return lines.join("\n").trim();
}
