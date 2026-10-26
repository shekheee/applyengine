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

/**
 * Seven-day row showing done / partial / missed per day. With `onSelect`, each
 * day is a button and `selected` is outlined.
 */
export function WeekStrip({
  days,
  selected,
  onSelect,
}: {
  days: WeekStripDay[];
  selected?: string;
  onSelect?: (date: string) => void;
}) {
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label="This week">
      {days.map((day) => {
        const title = `${day.date ?? day.label}: ${STATUS_TEXT[day.status]}${
          day.count ? ` (${day.count})` : ""
        }`;
        const className = cn(
          "flex h-11 w-full flex-col items-center justify-center rounded-md border text-[11px] font-medium",
          STATUS_STYLE[day.status],
          onSelect && "cursor-pointer hover:brightness-125",
          selected && day.date === selected && "ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--panel)]"
        );
        const body = (
          <>
            <span>{day.label}</span>
            <span className="sr-only">{STATUS_TEXT[day.status]}</span>
            <span aria-hidden className="text-[10px] tabular-nums opacity-80">
              {day.status === "upcoming" ? "" : day.count ?? ""}
            </span>
          </>
        );
        return (
          <li key={day.date ?? day.label} title={title}>
            {onSelect && day.date ? (
              <button
                type="button"
                className={className}
                aria-current={day.date === selected ? "date" : undefined}
                aria-label={`Show ${title}`}
                onClick={() => onSelect(day.date as string)}
              >
                {body}
              </button>
            ) : (
              <div className={className}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
