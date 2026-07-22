import type { Status } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

export const STATUS_STYLES: Record<
  Status,
  { dot: string; ring: string; label: string }
> = {
  saved: {
    dot: "bg-[var(--muted)]",
    ring: "ring-[var(--muted)]/30",
    label: STATUS_LABELS.saved,
  },
  applied: {
    dot: "bg-[var(--primary)]",
    ring: "ring-[var(--primary)]/35",
    label: STATUS_LABELS.applied,
  },
  interview: {
    dot: "bg-[var(--amber)]",
    ring: "ring-[var(--amber)]/35",
    label: STATUS_LABELS.interview,
  },
  offer: {
    dot: "bg-[var(--green)]",
    ring: "ring-[var(--green)]/35",
    label: STATUS_LABELS.offer,
  },
  rejected: {
    dot: "bg-[var(--red)]",
    ring: "ring-[var(--red)]/35",
    label: STATUS_LABELS.rejected,
  },
};
