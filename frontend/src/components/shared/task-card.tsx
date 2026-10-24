import { Badge, Button, Card } from "@/components/ui";

export type TaskCardTask = {
  title: string;
  type: string;
  targetMinutes: number;
  url?: string | null;
  linkLabel?: string;
  subtitle?: string | null;
};

export type TaskCardStatus = "todo" | "done";

/** One task with its type, target time, external link and a Start action. */
export function TaskCard({
  task,
  status,
  onStart,
  startLabel = "Start",
}: {
  task: TaskCardTask;
  status: TaskCardStatus;
  onStart?: () => void;
  startLabel?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{task.type.toUpperCase()}</Badge>
            <span className="text-xs tabular-nums text-[var(--muted)]">
              {task.targetMinutes} min target
            </span>
            {status === "done" && <Badge tone="green">Done</Badge>}
          </div>
          <h3 className="mt-2 text-base font-semibold text-[var(--text)]">{task.title}</h3>
          {task.subtitle && (
            <p className="mt-0.5 text-sm text-[var(--muted)]">{task.subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {task.url && (
            <a
              href={task.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-interactive inline-flex items-center rounded-[var(--radius-md)] border px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--panel-2)]"
              style={{ borderColor: "var(--border)" }}
            >
              {task.linkLabel ?? "Open"} ↗
            </a>
          )}
          {onStart && status !== "done" && (
            <Button size="sm" onClick={onStart}>
              {startLabel}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
