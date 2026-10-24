import { cn } from "@/components/ui";

export type WeekStripDay = {
  label: string;
  status: "done" | "partial" | "missed" | "today" | "upcoming";
  date?: string;
  count?: number;
};

const STATUS_STYLE: Record<WeekStripDay["status"], string> = {
  done: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
  partial: "bg-amber-500/15 border-amber-500/35 text-amber-300",
  missed: "bg-red-500/10 border-red-500/25 text-red-300",
  today: "bg-[var(--panel-2)] border-[var(--primary)] text-[var(--text)]",
  upcoming: "bg-transparent border-[var(--border)] text-[var(--muted-2)]",
};

const STATUS_TEXT: Record<WeekStripDay["status"], string> = {
  done: "done",
  partial: "partly done",
  missed: "missed",
  today: "today",
  upcoming: "upcoming",
};

/** Seven-day row showing done / partial / missed per day. */
export function WeekStrip({ days }: { days: WeekStripDay[] }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label="This week">
      {days.map((day) => (
        <li
          key={day.date ?? day.label}
          title={`${day.date ?? day.label}: ${STATUS_TEXT[day.status]}${
            day.count ? ` (${day.count})` : ""
          }`}
          className={cn(
            "flex h-11 flex-col items-center justify-center rounded-md border text-[11px] font-medium",
            STATUS_STYLE[day.status]
          )}
        >
          <span>{day.label}</span>
          <span className="sr-only">{STATUS_TEXT[day.status]}</span>
          <span aria-hidden className="text-[10px] tabular-nums opacity-80">
            {day.status === "upcoming" ? "" : day.count ?? ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
