import { cn } from "@/components/ui";

export { cn };

/** Score tone for /10 scale */
export function scoreTone(score: number): "green" | "amber" | "red" {
  if (score >= 8) return "green";
  if (score >= 6) return "amber";
  return "red";
}

export function scoreColor(score: number): string {
  const tone = scoreTone(score);
  return tone === "green" ? "var(--green)" : tone === "amber" ? "var(--amber)" : "var(--red)";
}

export function scoreBgClass(score: number): string {
  const tone = scoreTone(score);
  return tone === "green"
    ? "bg-emerald-500/12 text-emerald-300 border-emerald-500/25"
    : tone === "amber"
      ? "bg-amber-500/12 text-amber-300 border-amber-500/25"
      : "bg-red-500/12 text-red-300 border-red-500/25";
}

export function parseScoreFromContent(content: string): number | null {
  const m = content.match(/\*\*(\d+(?:\.\d+)?)\s*\/\s*10\*\*/);
  if (m) return parseFloat(m[1]);
  const m2 = content.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (m2) return parseFloat(m2[1]);
  return null;
}

export function extractScoresFromTurn(scores: Record<string, unknown>): number | null {
  if (scores.overall != null) return Number(scores.overall);
  if (scores.score != null) return Number(scores.score);
  return null;
}
