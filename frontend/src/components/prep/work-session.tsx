"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PrepAttemptResult, PrepSolved, PrepTaskDetail } from "@/lib/types";
import { Badge, Button, Card, Input, Label, PageSkeleton, Textarea, cn } from "@/components/ui";
import { Checklist } from "@/components/shared/checklist";
import { CodeEditor, clearDraft, loadDraft } from "@/components/shared/code-editor";
import { RatingInput } from "@/components/shared/rating-input";
import { Timer, clearTimer } from "@/components/shared/timer";
import { localISODate, shortDate } from "./dates";

const DSA_STEPS = [
  "Restate the problem and its constraints",
  "Brute force first, with its complexity",
  "Optimise: name the pattern",
  "Code it",
  "Trace an example and the edge cases",
];

const EXCALIDRAW_URL = "https://excalidraw.com";

const TYPE_LABEL: Record<string, string> = {
  dsa: "DSA",
  drill: "Drill",
  lld: "Low-level design",
  hld: "System design",
  python: "Python",
  project: "Project",
};

function siteName(url: string): string {
  if (url.includes("leetcode.com")) return "LeetCode";
  if (url.includes("neetcode.io")) return "NeetCode";
  return "site";
}

/** "Clarify (5)" -> 5 minutes; steps without a number get no time. */
function stepMinutes(step: string): number | null {
  const match = step.match(/\((\d+)\)\s*$/);
  return match ? Number(match[1]) : null;
}

export function WorkSession({ taskId }: { taskId: string }) {
  const [date] = useState(localISODate);
  const [task, setTask] = useState<PrepTaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPrepTask(taskId)
      .then(setTask)
      .catch((err: Error) => setError(err.message));
  }, [taskId]);

  if (error) {
    return (
      <div className="page-shell mx-auto max-w-5xl">
        <BackLink />
        <Card className="mt-4"><p className="text-sm text-[var(--red)]">{error}</p></Card>
      </div>
    );
  }
  if (!task) return <PageSkeleton />;
  return <SessionBody key={task.id} task={task} date={date} />;
}

function BackLink() {
  return (
    <Link href="/prep" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
      ← Today
    </Link>
  );
}

function SessionBody({ task, date }: { task: PrepTaskDetail; date: string }) {
  const draftKey = `prep:draft:${task.id}`;
  const timerKey = `prep:timer:${task.id}:${date}`;
  const isHld = task.type === "hld";
  const isProject = task.type === "project";
  const hasEditor = !isHld && !isProject;

  const [code, setCode] = useState(() => loadDraft(draftKey) ?? "");
  const [designNotes, setDesignNotes] = useState(() => (isHld ? loadDraft(draftKey) ?? "" : ""));
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [problemName, setProblemName] = useState("");
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");
  const [hintUsed, setHintUsed] = useState<boolean | null>(null);
  const [solved, setSolved] = useState<PrepSolved | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [complexity, setComplexity] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PrepAttemptResult | null>(null);

  // HLD notes reuse the same autosave as the code editor.
  useEffect(() => {
    if (!isHld) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, designNotes);
      } catch {
        // Storage unavailable; notes stay in memory.
      }
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [designNotes, draftKey, isHld]);

  const parsedMinutes = Number(minutes);
  const missing: string[] = [];
  if (!minutes || !(parsedMinutes > 0)) missing.push("time spent");
  if (hintUsed === null) missing.push("whether you used a hint");
  if (solved === null) missing.push("whether you solved it");
  if (task.synthetic && !problemName.trim()) missing.push("the problem name");

  const save = () => {
    if (missing.length || hintUsed === null || solved === null) return;
    setSaving(true);
    setError(null);
    api
      .logPrepAttempt({
        task_id: task.id,
        date,
        title: task.synthetic ? problemName.trim() : "",
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        elapsed_minutes: parsedMinutes,
        hint_used: hintUsed,
        solved,
        self_rating: rating,
        code: isHld ? designNotes : code,
        notes,
        complexity,
      })
      .then((res) => {
        clearDraft(draftKey);
        clearTimer(timerKey);
        setResult(res);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(false));
  };

  if (result) return <SavedSummary task={task} result={result} />;

  const dueRedo = task.open_redos.find((r) => r.due_date <= date);
  const rules = task.rules;

  return (
    <div className="page-shell mx-auto max-w-5xl space-y-5 pb-12">
      <BackLink />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{TYPE_LABEL[task.type] ?? task.type}</Badge>
            {task.pattern && <Badge>{task.pattern}</Badge>}
            {dueRedo && <Badge tone="amber">Redo · {dueRedo.reason}</Badge>}
            {task.stretch && <Badge>Stretch</Badge>}
          </div>
          <h1 className="page-title mt-2">{task.title}</h1>
          {task.attempts.length > 0 && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              Attempted {task.attempts.length}× · last {shortDate(task.attempts[0].date)},{" "}
              {Math.round(task.attempts[0].elapsed_minutes)} min,{" "}
              {task.attempts[0].hint_used ? "hint used" : "no hint"}
            </p>
          )}
        </div>
        {task.url && (
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-interactive inline-flex shrink-0 items-center rounded-[var(--radius-md)] border px-4 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--panel-2)]"
            style={{ borderColor: "var(--border)" }}
          >
            Open on {siteName(task.url)} ↗
          </a>
        )}
      </header>

      <Timer
        targetMinutes={task.target_minutes}
        storageKey={timerKey}
        stopLabel="Stop & log"
        onStop={(seconds, started) => {
          setStartedAt(started ? started.toISOString() : null);
          setMinutes(String(Math.max(1, Math.round(seconds / 60))));
          document.getElementById("finish-form")?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      <div className={cn("grid gap-5", task.type === "dsa" && "lg:grid-cols-[1fr_280px]")}>
        <div className="min-w-0 space-y-4">
          {task.synthetic && (
            <Card>
              <Label htmlFor="problem-name">Which NeetCode 150 medium did you pick?</Label>
              <Input
                id="problem-name"
                value={problemName}
                onChange={(e) => setProblemName(e.target.value)}
                placeholder="e.g. Koko Eating Bananas"
              />
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Pick one you have not seen before.
              </p>
            </Card>
          )}

          {(task.spec || task.extensions) && (
            <Card className="space-y-3">
              {task.spec && (
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Spec
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{task.spec}</p>
                </div>
              )}
              {task.extensions && (
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Extensions
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    {task.extensions}
                  </p>
                </div>
              )}
            </Card>
          )}

          {isHld && task.framework && (
            <Card>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-[var(--text)]">Framework</h2>
                <a
                  href={EXCALIDRAW_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[var(--primary-2)] hover:underline"
                >
                  Open Excalidraw ↗
                </a>
              </div>
              <Checklist
                items={task.framework.map((step) => {
                  const mins = stepMinutes(step);
                  return {
                    id: step,
                    label: step.replace(/\s*\(\d+\)\s*$/, ""),
                    sublabel: mins ? `${mins} min` : undefined,
                    checked: Boolean(steps[step]),
                  };
                })}
                onToggle={(id, checked) => setSteps((s) => ({ ...s, [id]: checked }))}
              />
            </Card>
          )}

          {isHld && (
            <Card>
              <Label htmlFor="design-notes">Design notes</Label>
              <Textarea
                value={designNotes}
                onChange={setDesignNotes}
                rows={12}
                placeholder="Requirements, estimates, components, data flow, evals, failure modes…"
              />
            </Card>
          )}

          {hasEditor && (
            <div>
              <p className="mb-2 text-xs text-[var(--muted)]">
                {task.type === "dsa"
                  ? "Paste your final solution. Completions are off."
                  : "Write it here. Completions are off; drafts save every 5 seconds."}
              </p>
              <CodeEditor value={code} onChange={setCode} draftKey={draftKey} height={420} />
            </div>
          )}
        </div>

        {task.type === "dsa" && (
          <aside>
            <Card className="space-y-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">The rules</h2>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--text-secondary)]">
                {DSA_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <ul className="space-y-1 border-t pt-3 text-xs text-[var(--muted)]" style={{ borderColor: "var(--border)" }}>
                {rules.attempt_before_hint_minutes && (
                  <li>Struggle {rules.attempt_before_hint_minutes} min before any hint.</li>
                )}
                {rules.max_minutes_dsa && <li>Stop at {rules.max_minutes_dsa} min.</li>}
                <li>A hint, overtime or a partial solve schedules redos. That is the point.</li>
              </ul>
            </Card>
          </aside>
        )}
      </div>

      <Card className="space-y-5">
        <div id="finish-form" className="scroll-mt-6">
          <h2 className="text-lg font-semibold tracking-tight">Log this attempt</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Honest logging is the point. A hint or overtime just brings the task back in 3 and 7 days.
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-[var(--text)]">Did you use a hint?</legend>
          <div className="grid max-w-md grid-cols-2 gap-2">
            {[
              { value: false, label: "No hint" },
              { value: true, label: "Yes, I used a hint" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={hintUsed === option.value}
                onClick={() => setHintUsed(option.value)}
                className={cn(
                  "rounded-[var(--radius-md)] border px-4 py-3 text-sm font-semibold transition-colors",
                  hintUsed === option.value
                    ? option.value
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                      : "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                    : "bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]"
                )}
                style={hintUsed === option.value ? undefined : { borderColor: "var(--border)" }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-[var(--muted)]">Solved?</legend>
            <div className="flex gap-2">
              {(["yes", "partial", "no"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={solved === value}
                  onClick={() => setSolved(value)}
                  className={cn(
                    "rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium capitalize",
                    solved === value
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]"
                  )}
                  style={solved === value ? undefined : { borderColor: "var(--border)" }}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="attempt-minutes">Minutes spent</Label>
            <Input
              id="attempt-minutes"
              type="number"
              min={1}
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="Stop the timer, or type it"
              className="max-w-[200px]"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">Self-rating</p>
            <RatingInput value={rating} onChange={setRating} />
          </div>
          {hasEditor && (
            <div>
              <Label htmlFor="attempt-complexity">Complexity</Label>
              <Input
                id="attempt-complexity"
                value={complexity}
                onChange={(e) => setComplexity(e.target.value)}
                placeholder="O(n) time, O(n) space"
              />
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="attempt-notes">Notes</Label>
          <Textarea
            value={notes}
            onChange={setNotes}
            rows={4}
            placeholder="What blocked you? Which pattern did you use?"
          />
        </div>

        {error && <p className="text-sm text-[var(--red)]">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={saving || missing.length > 0}>
            {saving ? "Saving…" : "Save attempt"}
          </Button>
          {missing.length > 0 && (
            <p className="text-xs text-[var(--muted)]">Still needed: {missing.join(", ")}.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function SavedSummary({ task, result }: { task: PrepTaskDetail; result: PrepAttemptResult }) {
  const created = result.redos_created;
  return (
    <div className="page-shell mx-auto max-w-2xl space-y-5 pb-12">
      <BackLink />
      <Card className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight">Logged: {result.attempt.title || task.title}</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {Math.round(result.attempt.elapsed_minutes)} min ·{" "}
          {result.attempt.hint_used ? "hint used" : "no hint"} · solved {result.attempt.solved}
        </p>
        {created.length > 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Redos on {created.map((r) => shortDate(r.due_date)).join(" and ")} ({created[0].reason}).
          </p>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">No redo needed.</p>
        )}
        {result.redos_cleared > 0 && (
          <p className="text-sm text-[var(--muted)]">
            Cleared {result.redos_cleared} due {result.redos_cleared === 1 ? "redo" : "redos"}.
          </p>
        )}
        <Button href="/prep">Back to today</Button>
      </Card>
    </div>
  );
}
