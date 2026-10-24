"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type {
  PrepAttempt,
  PrepAttemptResult,
  PrepSolved,
  PrepTaskDetail,
  PrepTestCase,
} from "@/lib/types";
import { ChatMarkdown } from "@/components/chat-markdown";
import { Badge, Button, Card, Input, Label, PageSkeleton, Textarea, cn } from "@/components/ui";
import { Checklist } from "@/components/shared/checklist";
import { CodeEditor, clearDraft, loadDraft } from "@/components/shared/code-editor";
import { CodeRunner } from "@/components/shared/code-runner";
import { RatingInput } from "@/components/shared/rating-input";
import { SplitPane } from "@/components/shared/split-pane";
import { Timer, clearTimer, timerElapsedSeconds, timerStartedAt } from "@/components/shared/timer";
import { Whiteboard, clearBoard, loadBoard, type BoardElement } from "@/components/shared/whiteboard";
import { localISODate, shortDate } from "./dates";
import { HintPanel } from "./hint-panel";
import { LevelPanel, cumulativeTests, useLevels } from "./level-panel";
import { TutorPanel } from "./tutor-panel";

const DSA_STEPS = [
  "Restate the problem and its constraints",
  "Brute force first, with its complexity",
  "Optimise: name the pattern",
  "Code it",
  "Trace an example and the edge cases",
];

const EXCALIDRAW_TIPS = "Label boxes and connect them with arrows; the tutor reads both.";

const RUNNABLE_TYPES = new Set(["drill", "lld", "python", "fundamentals", "challenge"]);
const DESIGN_TYPES = new Set(["hld", "project"]);

const TYPE_LABEL: Record<string, string> = {
  dsa: "DSA",
  drill: "Drill",
  lld: "Low-level design",
  hld: "System design",
  python: "Python",
  project: "Project",
  challenge: "Challenge",
  fundamentals: "LLM fundamentals",
};

type Tab = "description" | "hints" | "solution" | "submissions";

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

  const load = useCallback(() => {
    api
      .getPrepTask(taskId, date)
      .then(setTask)
      .catch((err: Error) => setError(err.message));
  }, [taskId, date]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <Link href="/prep" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          ← Today
        </Link>
        <Card className="mt-4"><p className="text-sm text-[var(--red)]">{error}</p></Card>
      </div>
    );
  }
  if (!task) return <PageSkeleton />;
  return <Workspace key={task.id} task={task} date={date} reload={load} />;
}

function Workspace({
  task,
  date,
  reload,
}: {
  task: PrepTaskDetail;
  date: string;
  reload: () => void;
}) {
  const draftKey = `prep:draft:${task.id}`;
  const boardKey = `prep:board:${task.id}`;
  const timerKey = `prep:timer:${task.id}:${date}`;
  const isDesign = DESIGN_TYPES.has(task.type);
  const runnable = RUNNABLE_TYPES.has(task.type);

  const [code, setCode] = useState(() => (isDesign ? "" : loadDraft(draftKey) ?? task.starter ?? ""));
  const [notes, setNotes] = useState(() => (isDesign ? loadDraft(draftKey) ?? "" : ""));
  const [initialBoard] = useState<BoardElement[]>(() => (isDesign ? loadBoard(boardKey) : []));
  const board = useRef<BoardElement[]>(initialBoard);
  const [tab, setTab] = useState<Tab>("description");
  const [hintsOpened, setHintsOpened] = useState(task.hints_revealed.length > 0);
  const [revealedSolution, setRevealedSolution] = useState<string | null>(
    task.solution_revealed ? task.solution : null
  );
  const [lastSubmit, setLastSubmit] = useState<{ passed: number; total: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [logged, setLogged] = useState<PrepAttemptResult | null>(null);
  const [timerEpoch, setTimerEpoch] = useState(0);
  const levels = task.levels ?? [];
  const levelState = useLevels(task.id, Math.max(levels.length, 1));
  const [levelsDone, setLevelsDone] = useState(false);

  // Design notes autosave like the code editor does.
  useEffect(() => {
    if (!isDesign) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, notes);
      } catch {
        // Storage unavailable; notes stay in memory.
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [notes, draftKey, isDesign]);

  const tests: PrepTestCase[] = levels.length ? cumulativeTests(levels, levelState.current) : task.tests;
  const dueRedo = task.open_redos.find((r) => r.due_date <= date);
  const attempts: PrepAttempt[] = logged ? [logged.attempt, ...task.attempts] : task.attempts;
  const reviewAttempt = logged?.attempt ?? task.attempts[0] ?? null;

  const onLogged = (result: PrepAttemptResult) => {
    // The next attempt (a redo days later) should start fresh; this one is in Submissions.
    setCode(task.starter ?? "");
    setNotes("");
    board.current = [];
    clearDraft(draftKey);
    clearBoard(boardKey);
    clearTimer(timerKey);
    setTimerEpoch((n) => n + 1);
    setLogged(result);
    setFinishing(false);
    setTab("solution");
    reload();
  };

  const header = (
    <header
      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border bg-[var(--panel)] px-3 py-2"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link href="/prep" className="text-sm text-[var(--muted)] hover:text-[var(--text)]" aria-label="Back to Today">
          ←
        </Link>
        <h1 className="truncate text-sm font-semibold text-[var(--text)] sm:text-base">{task.title}</h1>
        <Badge tone="primary">{TYPE_LABEL[task.type] ?? task.type}</Badge>
        {dueRedo && <Badge tone="amber">Redo</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {task.url && (
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[var(--radius-md)] border px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--panel-2)]"
            style={{ borderColor: "var(--border)" }}
          >
            Open on {siteName(task.url)} ↗
          </a>
        )}
        <Timer key={timerEpoch} compact targetMinutes={task.target_minutes} storageKey={timerKey} />
        {logged ? (
          <Badge tone="green">Logged ✓</Badge>
        ) : (
          <Button size="sm" onClick={() => setFinishing(true)}>
            Finish
          </Button>
        )}
      </div>
    </header>
  );

  const left = (
    <ProblemPanel
      task={task}
      date={date}
      tab={tab}
      onTab={setTab}
      levels={levels}
      levelState={levelState}
      levelsDone={levelsDone}
      examples={tests.filter((t) => !t.hidden)}
      hintsOpened={hintsOpened}
      onHintReveal={(solution) => {
        setHintsOpened(true);
        if (solution) setRevealedSolution(solution);
      }}
      revealedSolution={revealedSolution}
      attempts={attempts}
      reviewAttempt={reviewAttempt}
      autoReview={Boolean(logged)}
      loggedNote={logged}
      onLoadCode={
        isDesign
          ? undefined
          : (text) => {
              if (window.confirm("Replace the editor contents with this submission?")) setCode(text);
            }
      }
    />
  );

  const right = isDesign ? (
    <SplitPane
      direction="vertical"
      storageKey="prep:split:design"
      initial={0.68}
      first={
        <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border bg-[var(--panel)]" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-[var(--muted)]" style={{ borderColor: "var(--border)" }}>
            <span className="font-medium text-[var(--text)]">Whiteboard</span>
            <span className="hidden truncate pl-3 md:inline">{EXCALIDRAW_TIPS}</span>
          </div>
          <div className="min-h-0 flex-1">
            <Whiteboard
              key={`board-${timerEpoch}`}
              initialElements={logged ? [] : initialBoard}
              draftKey={boardKey}
              onChange={(elements) => {
                board.current = elements;
              }}
              className="h-full"
            />
          </div>
        </div>
      }
      second={
        <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border bg-[var(--panel)]" style={{ borderColor: "var(--border)" }}>
          <div className="border-b px-3 py-1.5 text-xs font-medium text-[var(--text)]" style={{ borderColor: "var(--border)" }}>
            Notes
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="Design notes"
            placeholder="Requirements, estimates (QPS, storage), API, data model, deep dives, trade-offs…"
            className="min-h-0 flex-1 resize-none bg-transparent p-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted-2)]"
          />
        </div>
      }
    />
  ) : (
    <SplitPane
      direction="vertical"
      storageKey="prep:split:code"
      initial={0.6}
      min={0.25}
      max={0.85}
      first={
        <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border bg-[var(--panel)]" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
            <span className="font-medium text-[var(--text)]">Python 3</span>
            <div className="flex items-center gap-3 text-[var(--muted)]">
              <span className="hidden sm:inline">Completions off · autosaves</span>
              {task.starter && code !== task.starter && (
                <button
                  type="button"
                  onClick={() => window.confirm("Replace your code with the starter?") && setCode(task.starter ?? "")}
                  className="hover:text-[var(--text)]"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 p-1">
            <CodeEditor value={code} onChange={setCode} draftKey={draftKey} height="100%" />
          </div>
        </div>
      }
      second={
        <CodeRunner
          fill
          code={code}
          tests={runnable ? tests : undefined}
          onResult={({ mode, passed, total }) => {
            if (mode !== "submit" || total === 0) return;
            setLastSubmit({ passed, total });
            if (!levels.length || passed < total) return;
            if (levelState.current === levels.length) setLevelsDone(true);
            levelState.passLevel(levelState.current);
          }}
        />
      }
    />
  );

  return (
    <div className="flex flex-col gap-2 lg:h-[calc(100dvh-1rem)]">
      {header}
      <SplitPane
        className="min-h-0 flex-1"
        storageKey="prep:split:main"
        initial={0.42}
        min={0.25}
        max={0.7}
        first={<div className="h-full max-lg:max-h-[70vh]">{left}</div>}
        second={<div className="h-[80vh] lg:h-full">{right}</div>}
      />
      {finishing && (
        <FinishDialog
          task={task}
          date={date}
          timerKey={timerKey}
          hintsOpened={hintsOpened}
          lastSubmit={lastSubmit}
          isDesign={isDesign}
          getWork={() => (isDesign ? { code: notes, diagram: board.current } : { code, diagram: null })}
          onCancel={() => setFinishing(false)}
          onLogged={onLogged}
        />
      )}
    </div>
  );
}

function ProblemPanel({
  task,
  date,
  tab,
  onTab,
  levels,
  levelState,
  levelsDone,
  examples,
  hintsOpened,
  onHintReveal,
  revealedSolution,
  attempts,
  reviewAttempt,
  autoReview,
  loggedNote,
  onLoadCode,
}: {
  task: PrepTaskDetail;
  date: string;
  tab: Tab;
  onTab: (tab: Tab) => void;
  levels: { title: string; brief: string; tests: PrepTestCase[] }[];
  levelState: ReturnType<typeof useLevels>;
  levelsDone: boolean;
  examples: PrepTestCase[];
  hintsOpened: boolean;
  onHintReveal: (solution: string | null) => void;
  revealedSolution: string | null;
  attempts: PrepAttempt[];
  reviewAttempt: PrepAttempt | null;
  autoReview: boolean;
  loggedNote: PrepAttemptResult | null;
  onLoadCode?: (code: string) => void;
}) {
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [showTopics, setShowTopics] = useState(false);
  const solutionLocked = !reviewAttempt && !revealedSolution;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "description", label: "Description" },
    { id: "hints", label: `Hints${task.hints_total ? ` ${hintsOpened ? "·" : ""}` : ""}` },
    { id: "solution", label: solutionLocked ? "Solution 🔒" : "Solution" },
    { id: "submissions", label: `Submissions${attempts.length ? ` (${attempts.length})` : ""}` },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border bg-[var(--panel)]" style={{ borderColor: "var(--border)" }}>
      <div role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5" style={{ borderColor: "var(--border)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              "shrink-0 rounded px-2.5 py-1 text-xs font-medium",
              tab === t.id ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "description" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">{task.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <span>{task.target_minutes} min target</span>
                {task.attempts.length > 0 && (
                  <span>
                    · attempted {task.attempts.length}×, last {shortDate(task.attempts[0].date)}
                  </span>
                )}
              </div>
            </div>

            {levels.length > 0 && (
              <LevelPanel
                levels={levels}
                current={levelState.current}
                unlocked={levelState.unlocked}
                onSelect={levelState.setCurrent}
                completed={levelsDone}
              />
            )}

            {task.statement ? (
              <ChatMarkdown content={task.statement} density="compact" />
            ) : task.brief ? (
              <ChatMarkdown content={task.brief} density="compact" />
            ) : (
              (task.spec || task.extensions) && (
                <div className="space-y-2 text-sm text-[var(--text-secondary)]">
                  {task.spec && <p>{task.spec}</p>}
                  {task.extensions && <p className="text-[var(--muted)]">Extensions: {task.extensions}</p>}
                </div>
              )
            )}

            {!task.statement && examples.length > 0 && (
              <div className="space-y-3">
                {examples.map((example, index) => (
                  <div key={`${example.name}-${index}`}>
                    <p className="text-sm font-semibold text-[var(--text)]">Example {index + 1}</p>
                    <div className="mt-1.5 space-y-1 border-l-2 pl-3 font-mono text-xs leading-5" style={{ borderColor: "var(--border-strong)" }}>
                      <p>
                        <span className="font-semibold text-[var(--text)]">Input: </span>
                        <span className="text-[var(--text-secondary)]">{example.input}</span>
                      </p>
                      {example.expected && (
                        <p>
                          <span className="font-semibold text-[var(--text)]">Output: </span>
                          <span className="whitespace-pre-wrap text-[var(--text-secondary)]">{example.expected}</span>
                        </p>
                      )}
                      <p className="font-sans text-[var(--muted)]">{example.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {task.type === "dsa" && (
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">How to work it</p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
                  {DSA_STEPS.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {task.rules.attempt_before_hint_minutes && (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Struggle {task.rules.attempt_before_hint_minutes} min before any hint; stop at {task.rules.max_minutes_dsa ?? 40}.
                  </p>
                )}
              </div>
            )}

            {task.learn && (
              <details className="rounded-[var(--radius-md)] border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <summary className="cursor-pointer text-sm font-medium text-[var(--text)]">
                  Concepts to review <span className="font-normal text-[var(--muted)]">(optional)</span>
                </summary>
                <div className="mt-2">
                  <ChatMarkdown content={task.learn} density="compact" />
                </div>
              </details>
            )}

            {task.framework && (
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Framework (45 min)</p>
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
              </div>
            )}

            {(task.pattern || task.difficulty) && (
              <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setShowTopics((v) => !v)}
                  className="text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
                >
                  {showTopics ? "Hide topics" : "Show topics"}
                </button>
                {showTopics && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {task.difficulty && <Badge>{task.difficulty}</Badge>}
                    {task.pattern && <Badge>{task.pattern}</Badge>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "hints" && (
          <HintPanel
            taskId={task.id}
            date={date}
            total={task.hints_total}
            initial={task.hints_revealed}
            waitMinutes={task.type === "dsa" ? task.rules.attempt_before_hint_minutes : undefined}
            initialSolution={revealedSolution}
            onReveal={(_, solution) => onHintReveal(solution)}
          />
        )}

        {tab === "solution" &&
          (solutionLocked ? (
            <div className="space-y-2 py-6 text-center">
              <p className="text-sm font-medium text-[var(--text)]">Solve it first</p>
              <p className="text-sm text-[var(--muted)]">
                Press Finish to log your attempt. The review of your approach, the ideal solution and
                follow-up questions unlock here.
              </p>
            </div>
          ) : !reviewAttempt && revealedSolution ? (
            <div className="space-y-3">
              <p className="text-xs text-amber-300">
                You opened the solution as the last hint. Press Finish to log the attempt and get a
                review of your own code.
              </p>
              <ChatMarkdown content={revealedSolution} density="compact" />
            </div>
          ) : reviewAttempt ? (
            <div className="space-y-3">
              {loggedNote && (
                <p className="text-xs text-[var(--muted)]">
                  Logged {Math.round(loggedNote.attempt.elapsed_minutes)} min · solved {loggedNote.attempt.solved}
                  {loggedNote.redos_created.length > 0 &&
                    ` · redos on ${loggedNote.redos_created.map((r) => shortDate(r.due_date)).join(" and ")}`}
                </p>
              )}
              <TutorPanel
                key={reviewAttempt.id}
                attemptId={reviewAttempt.id}
                solution={task.solution ?? revealedSolution}
                autoStart={autoReview}
              />
            </div>
          ) : null)}

        {tab === "submissions" && <Submissions attempts={attempts} onLoadCode={onLoadCode} />}
      </div>
    </div>
  );
}

function Submissions({
  attempts,
  onLoadCode,
}: {
  attempts: PrepAttempt[];
  onLoadCode?: (code: string) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (attempts.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--muted)]">No submissions yet.</p>;
  }
  return (
    <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
      {attempts.map((attempt) => {
        const tone = attempt.solved === "yes" && !attempt.hint_used ? "green" : attempt.solved === "no" ? "red" : "amber";
        return (
          <li key={attempt.id} className="py-2.5">
            <button
              type="button"
              onClick={() => setOpen(open === attempt.id ? null : attempt.id)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex items-center gap-2">
                <Badge tone={tone}>{attempt.solved === "yes" ? "Solved" : attempt.solved === "partial" ? "Partial" : "Not solved"}</Badge>
                <span className="text-sm text-[var(--text)]">{shortDate(attempt.date)}</span>
              </span>
              <span className="text-xs text-[var(--muted)]">
                {Math.round(attempt.elapsed_minutes)} min · {attempt.hint_used ? "hint" : "no hint"}
              </span>
            </button>
            {open === attempt.id && (
              <div className="mt-2 space-y-2">
                {attempt.complexity && <p className="text-xs text-[var(--muted)]">Complexity: {attempt.complexity}</p>}
                {attempt.notes && <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{attempt.notes}</p>}
                {attempt.code && (
                  <pre className="max-h-64 overflow-auto rounded bg-[var(--panel-2)] p-2 font-mono text-xs leading-5 text-[var(--text)]">
                    {attempt.code}
                  </pre>
                )}
                {attempt.diagram && attempt.diagram.length > 0 && (
                  <div className="h-72 overflow-hidden rounded border" style={{ borderColor: "var(--border)" }}>
                    <Whiteboard initialElements={attempt.diagram as BoardElement[]} readOnly className="h-full" />
                  </div>
                )}
                {onLoadCode && attempt.code && (
                  <Button size="sm" variant="outline" onClick={() => onLoadCode(attempt.code)}>
                    Load into editor
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FinishDialog({
  task,
  date,
  timerKey,
  hintsOpened,
  lastSubmit,
  isDesign,
  getWork,
  onCancel,
  onLogged,
}: {
  task: PrepTaskDetail;
  date: string;
  timerKey: string;
  hintsOpened: boolean;
  lastSubmit: { passed: number; total: number } | null;
  isDesign: boolean;
  getWork: () => { code: string; diagram: BoardElement[] | null };
  onCancel: () => void;
  onLogged: (result: PrepAttemptResult) => void;
}) {
  const [minutes, setMinutes] = useState(() => {
    const seconds = timerElapsedSeconds(timerKey);
    return seconds > 0 ? String(Math.max(1, Math.round(seconds / 60))) : "";
  });
  const [hintUsed, setHintUsed] = useState<boolean | null>(hintsOpened ? true : null);
  const [solved, setSolved] = useState<PrepSolved | null>(() => {
    if (!lastSubmit) return null;
    if (lastSubmit.passed === lastSubmit.total) return "yes";
    return lastSubmit.passed > 0 ? "partial" : "no";
  });
  const [rating, setRating] = useState<number | null>(null);
  const [complexity, setComplexity] = useState("");
  const [notes, setNotes] = useState("");
  const [problemName, setProblemName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(minutes);
  const missing: string[] = [];
  if (!(parsed > 0)) missing.push("time spent");
  if (hintUsed === null) missing.push("hint");
  if (solved === null) missing.push("solved");
  if (task.synthetic && !problemName.trim()) missing.push("problem name");

  const save = () => {
    if (missing.length || hintUsed === null || solved === null) return;
    setSaving(true);
    setError(null);
    const work = getWork();
    const started = timerStartedAt(timerKey);
    api
      .logPrepAttempt({
        task_id: task.id,
        date,
        title: task.synthetic ? problemName.trim() : "",
        started_at: started ? started.toISOString() : null,
        ended_at: new Date().toISOString(),
        elapsed_minutes: parsed,
        hint_used: hintUsed,
        solved,
        self_rating: rating,
        code: work.code,
        notes,
        complexity,
        diagram: work.diagram && work.diagram.length ? work.diagram : null,
      })
      .then(onLogged)
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(false));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const choice = (active: boolean, tone: "green" | "amber" | "primary" = "primary") =>
    cn(
      "rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium",
      active
        ? tone === "green"
          ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
          : tone === "amber"
            ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
            : "border-[var(--primary)] bg-[var(--primary)] text-white"
        : "bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)]"
    );

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Log this attempt">
      <Card className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Log this attempt</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {lastSubmit
              ? `Last Submit: ${lastSubmit.passed} / ${lastSubmit.total} testcases passed.`
              : "Honest logging is the point: a hint or a partial solve just brings it back in 3 and 7 days."}
          </p>
        </div>

        {task.synthetic && (
          <div>
            <Label htmlFor="problem-name">Which NeetCode 150 medium?</Label>
            <Input id="problem-name" value={problemName} onChange={(e) => setProblemName(e.target.value)} placeholder="e.g. Koko Eating Bananas" />
          </div>
        )}

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-[var(--muted)]">Did you use a hint?</legend>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={hintUsed === false} disabled={hintsOpened} onClick={() => setHintUsed(false)} className={cn(choice(hintUsed === false, "green"), hintsOpened && "opacity-50")}>
              No hint
            </button>
            <button type="button" aria-pressed={hintUsed === true} onClick={() => setHintUsed(true)} className={choice(hintUsed === true, "amber")}>
              Yes, I used a hint
            </button>
          </div>
          {hintsOpened && <p className="mt-1.5 text-xs text-amber-300">You opened a hint in this session.</p>}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-[var(--muted)]">Solved?</legend>
            <div className="flex gap-2">
              {(["yes", "partial", "no"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={solved === value} onClick={() => setSolved(value)} className={cn(choice(solved === value), "capitalize")}>
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="attempt-minutes">Minutes</Label>
            <Input id="attempt-minutes" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minutes spent" />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">Self-rating</p>
            <RatingInput value={rating} onChange={setRating} />
          </div>
          {!isDesign && (
            <div>
              <Label htmlFor="attempt-complexity">Complexity</Label>
              <Input id="attempt-complexity" value={complexity} onChange={(e) => setComplexity(e.target.value)} placeholder="O(n) time, O(n) space" />
            </div>
          )}
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea value={notes} onChange={setNotes} rows={3} placeholder="What blocked you? Which pattern did you use?" />
        </div>

        {error && <p className="text-sm text-[var(--red)]">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={saving || missing.length > 0}>
            {saving ? "Saving…" : "Save attempt"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Keep working
          </Button>
          {missing.length > 0 && <span className="text-xs text-[var(--muted)]">Needs: {missing.join(", ")}</span>}
        </div>
      </Card>
    </div>
  );
}
