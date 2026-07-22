import type { Status } from "@/lib/types";

export type StatusTone = "default" | "primary" | "amber" | "green" | "red";

export const STATUS_CONFIG: Record<
  Status,
  {
    label: string;
    tone: StatusTone;
    accent: string;
    accentMuted: string;
    description: string;
  }
> = {
  saved: {
    label: "Saved",
    tone: "default",
    accent: "var(--muted)",
    accentMuted: "color-mix(in srgb, var(--muted) 18%, transparent)",
    description: "Roles you're evaluating",
  },
  applied: {
    label: "Applied",
    tone: "primary",
    accent: "var(--primary)",
    accentMuted: "color-mix(in srgb, var(--primary) 18%, transparent)",
    description: "Submitted applications",
  },
  interview: {
    label: "Interview",
    tone: "amber",
    accent: "var(--amber)",
    accentMuted: "color-mix(in srgb, var(--amber) 18%, transparent)",
    description: "Active interview stages",
  },
  offer: {
    label: "Offer",
    tone: "green",
    accent: "var(--green)",
    accentMuted: "color-mix(in srgb, var(--green) 18%, transparent)",
    description: "Offers received",
  },
  rejected: {
    label: "Rejected",
    tone: "red",
    accent: "var(--red)",
    accentMuted: "color-mix(in srgb, var(--red) 18%, transparent)",
    description: "Closed out roles",
  },
};

export function fitTone(score: number | null): StatusTone {
  if (score === null) return "default";
  if (score >= 70) return "green";
  if (score >= 45) return "amber";
  return "red";
}

export function fitColor(score: number | null): string {
  if (score === null) return "var(--muted)";
  if (score >= 70) return "var(--green)";
  if (score >= 45) return "var(--amber)";
  return "var(--red)";
}

export function companyInitial(company: string | undefined): string {
  if (!company || company === "—") return "?";
  const parts = company.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return company.slice(0, 2).toUpperCase();
}
