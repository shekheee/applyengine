import { cn } from "@/components/ui";

/** 1-5 self-rating as a radio group. */
export function RatingInput({
  value,
  onChange,
  label = "Self-rating",
}: {
  value: number | null;
  onChange: (value: number) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of 5`}
          onClick={() => onChange(n)}
          className={cn(
            "h-9 w-9 rounded-[var(--radius-md)] border text-sm font-semibold tabular-nums transition-colors",
            value === n
              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
              : "bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]"
          )}
          style={value === n ? undefined : { borderColor: "var(--border)" }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
