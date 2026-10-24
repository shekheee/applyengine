"use client";

import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@/components/ui";
import { RUNNER_PRELUDE } from "./runner-prelude";

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js";

export type RunnerTest = { name: string; code: string; input?: string; hidden?: boolean };

type Expectation = { label: string | null; actual: string; expected: string; ok: boolean };

type CaseResult = {
  name: string;
  input: string;
  hidden: boolean;
  passed: boolean;
  message: string | null;
  expects: Expectation[];
  stdout: string;
  ms: number;
};

type RunResult = {
  mode: "run" | "submit";
  stdout: string;
  error: string | null;
  cases: CaseResult[];
  timedOut?: boolean;
  ms: number;
};

type Status = "idle" | "loading" | "running";

/*
 * Runs in a Web Worker so a runaway loop can be killed with terminate().
 * Each run gets a fresh globals dict: the prelude (expect helpers), then the
 * learner's code, then each case in that same dict. A case passes when it
 * raises nothing; expect() calls record its Output vs Expected.
 */
const WORKER_SOURCE = `
importScripts(${JSON.stringify(PYODIDE_URL)});
const ready = loadPyodide();
ready.then(() => self.postMessage({ type: "ready" }), (e) => self.postMessage({ type: "load-error", error: String(e) }));
const PRELUDE = ${JSON.stringify(RUNNER_PRELUDE)};

function clean(err) {
  // Keep only the user's frames: everything from the first <exec> frame on.
  const lines = String((err && err.message) || err).split("\\n");
  const first = lines.findIndex((line) => line.includes('File "<exec>"'));
  if (first === -1) return lines.join("\\n").trim();
  return ["Traceback (most recent call last):", ...lines.slice(first)].join("\\n").trim();
}

function lastLine(text) {
  const lines = text.split("\\n").filter(Boolean);
  return lines[lines.length - 1] || text;
}

self.onmessage = async (event) => {
  const { id, code, tests } = event.data;
  const py = await ready;
  const runStarted = performance.now();
  let out = [];
  py.setStdout({ batched: (s) => out.push(s) });
  py.setStderr({ batched: (s) => out.push(s) });
  const ns = py.globals.get("dict")();
  let error = null;
  const cases = [];
  try {
    await py.runPythonAsync(PRELUDE, { globals: ns });
    await py.loadPackagesFromImports(code, { messageCallback: () => {} });
    await py.runPythonAsync(code, { globals: ns });
  } catch (e) {
    error = clean(e);
  }
  const programStdout = out.join("\\n");
  if (!error && tests) {
    const expects = ns.get("_EXPECTS");
    for (const test of tests) {
      out = [];
      expects.clear();
      const started = performance.now();
      let message = null;
      try {
        await py.runPythonAsync(test.code, { globals: ns });
      } catch (e) {
        message = clean(e);
      }
      const recorded = expects.toJs({ dict_converter: Object.fromEntries });
      cases.push({
        name: test.name,
        input: test.input || "",
        hidden: !!test.hidden,
        passed: message === null,
        message: message && (recorded.some((x) => !x.ok) ? lastLine(message) : message),
        expects: recorded,
        stdout: out.join("\\n"),
        ms: Math.round(performance.now() - started),
      });
    }
    expects.destroy();
  }
  ns.destroy();
  const ms = Math.round(performance.now() - runStarted);
  self.postMessage({ type: "result", id, stdout: programStdout, error, cases, ms });
};
`;

function createWorker(): Worker {
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}

function verdict(result: RunResult): { label: string; tone: "ok" | "bad" } {
  if (result.timedOut) return { label: "Time Limit Exceeded", tone: "bad" };
  if (result.error) return { label: "Runtime Error", tone: "bad" };
  if (result.cases.length === 0) return { label: "Finished", tone: "ok" };
  const failed = result.cases.find((c) => !c.passed);
  if (!failed) return { label: "Accepted", tone: "ok" };
  return failed.expects.some((e) => !e.ok)
    ? { label: "Wrong Answer", tone: "bad" }
    : { label: "Runtime Error", tone: "bad" };
}

function caseLabel(cases: { hidden: boolean }[], index: number): string {
  const visibleBefore = cases.slice(0, index).filter((c) => !c.hidden).length;
  const hiddenBefore = index - visibleBefore;
  return cases[index].hidden ? `Hidden ${hiddenBefore + 1}` : `Case ${visibleBefore + 1}`;
}

function Block({ label, children, tone }: { label: string; children: string; tone?: "bad" | "ok" }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-[var(--muted)]">{label}</p>
      <pre
        className={cn(
          "max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--panel-2)] px-3 py-2 font-mono text-xs leading-5",
          tone === "bad" ? "text-[var(--red)]" : tone === "ok" ? "text-emerald-300" : "text-[var(--text)]"
        )}
      >
        {children}
      </pre>
    </div>
  );
}

/**
 * Runs Python in the browser via Pyodide, loaded on the first run. With tests it
 * behaves like a LeetCode console: Run executes the example cases, Submit adds
 * the hidden ones, and each case shows Input, Output and Expected.
 */
export function CodeRunner({
  code,
  tests,
  timeoutMs = 10_000,
}: {
  code: string;
  tests?: RunnerTest[];
  timeoutMs?: number;
}) {
  const workerRef = useRef<Worker | null>(null);
  const loadedRef = useRef(false);
  const runIdRef = useRef(0);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<"cases" | "result">("cases");
  const [selectedCase, setSelectedCase] = useState(0);
  const [selectedResult, setSelectedResult] = useState(0);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const allTests = tests ?? [];
  const examples = allTests.filter((t) => !t.hidden);
  const hiddenCount = allTests.length - examples.length;
  const hasTests = allTests.length > 0;

  const run = (mode: "run" | "submit") => {
    const selected = mode === "submit" ? allTests : examples;
    let worker = workerRef.current;
    if (!worker) {
      worker = createWorker();
      workerRef.current = worker;
      loadedRef.current = false;
    }
    runIdRef.current += 1;
    const id = runIdRef.current;
    setStatus(loadedRef.current ? "running" : "loading");
    setLoadError(null);
    setTab("result");

    // The clock only starts once Pyodide is loaded; a first load can take a while.
    let timer: number | undefined;
    const arm = () => {
      timer = window.setTimeout(() => {
        worker?.terminate();
        workerRef.current = null;
        setStatus("idle");
        setResult({
          mode,
          stdout: "",
          error: null,
          cases: [],
          timedOut: true,
          ms: timeoutMs,
        });
      }, timeoutMs);
    };
    if (loadedRef.current) arm();

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === "ready") {
        loadedRef.current = true;
        setStatus("running");
        arm();
      } else if (data.type === "load-error") {
        window.clearTimeout(timer);
        worker?.terminate();
        workerRef.current = null;
        setStatus("idle");
        setLoadError(`Could not load Python: ${data.error}`);
      } else if (data.type === "result" && data.id === id) {
        window.clearTimeout(timer);
        setStatus("idle");
        const next: RunResult = {
          mode,
          stdout: data.stdout,
          error: data.error,
          cases: data.cases,
          ms: data.ms,
        };
        setResult(next);
        const firstFailed = next.cases.findIndex((c) => !c.passed);
        setSelectedResult(firstFailed === -1 ? 0 : firstFailed);
      }
    };
    worker.postMessage({ id, code, tests: selected });
  };

  const busy = status !== "idle";
  const shownCase = examples[selectedCase];
  const outcome = result ? verdict(result) : null;
  const passed = result?.cases.filter((c) => c.passed).length ?? 0;
  const current = result?.cases[selectedResult];

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border bg-[var(--panel)]" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
        <div role="tablist" className="flex gap-1">
          {hasTests && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === "cases"}
              onClick={() => setTab("cases")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium",
                tab === "cases" ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              Testcase
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={tab === "result" || !hasTests}
            onClick={() => setTab("result")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium",
              tab === "result" || !hasTests ? "bg-[var(--panel-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            {hasTests ? "Test Result" : "Output"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => run("run")} disabled={busy || !code.trim()}>
            {status === "loading" ? "Loading Python…" : status === "running" ? "Running…" : "Run"}
          </Button>
          {hasTests && (
            <Button size="sm" onClick={() => run("submit")} disabled={busy || !code.trim()}>
              Submit
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-[180px] p-3" aria-live="polite">
        {hasTests && tab === "cases" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {examples.map((test, index) => (
                <button
                  key={test.name}
                  type="button"
                  onClick={() => setSelectedCase(index)}
                  className={cn(
                    "rounded-[var(--radius-md)] px-3 py-1 text-xs font-medium",
                    index === selectedCase ? "bg-[var(--panel-3)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--panel-2)]"
                  )}
                >
                  Case {index + 1}
                </button>
              ))}
            </div>
            {shownCase && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[var(--text-secondary)]">{shownCase.name}</p>
                <Block label="Input">{shownCase.input || "(see test code)"}</Block>
                <details>
                  <summary className="cursor-pointer text-[11px] text-[var(--muted)]">Test code</summary>
                  <Block label="">{shownCase.code.trim()}</Block>
                </details>
              </div>
            )}
            <p className="text-[11px] text-[var(--muted)]">
              Run checks these {examples.length} example{examples.length === 1 ? "" : "s"}.
              {hiddenCount > 0 && ` Submit also runs ${hiddenCount} hidden edge case${hiddenCount === 1 ? "" : "s"}.`}
            </p>
          </div>
        )}

        {(tab === "result" || !hasTests) && (
          <div className="space-y-3">
            {loadError && <p className="text-sm text-[var(--red)]">{loadError}</p>}
            {!result && !loadError && (
              <p className="text-sm text-[var(--muted)]">
                {status === "loading"
                  ? "Downloading Python (first run only)…"
                  : status === "running"
                    ? "Running…"
                    : hasTests
                      ? "Run your code against the examples, or Submit to include hidden edge cases."
                      : "Output appears here. Python runs in your browser."}
              </p>
            )}
            {result && outcome && (
              <>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className={cn("text-base font-semibold", outcome.tone === "ok" ? "text-emerald-300" : "text-[var(--red)]")}>
                    {outcome.label}
                  </span>
                  {result.cases.length > 0 && (
                    <span className="text-xs tabular-nums text-[var(--muted)]">
                      {passed} / {result.cases.length} testcases passed
                      {result.mode === "run" && hiddenCount > 0 ? " (examples only)" : ""}
                    </span>
                  )}
                  {!result.timedOut && (
                    <span className="text-xs tabular-nums text-[var(--muted)]">Runtime {result.ms} ms</span>
                  )}
                </div>
                {result.timedOut && (
                  <p className="text-sm text-[var(--red)]">
                    Stopped after {Math.round(timeoutMs / 1000)} s. Infinite loop or a very slow algorithm?
                  </p>
                )}
                {result.error && <Block label="Error" tone="bad">{result.error}</Block>}
                {result.stdout && <Block label="Stdout">{result.stdout}</Block>}
                {result.cases.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {result.cases.map((c, index) => (
                      <button
                        key={`${c.name}-${index}`}
                        type="button"
                        onClick={() => setSelectedResult(index)}
                        className={cn(
                          "rounded-[var(--radius-md)] px-3 py-1 text-xs font-medium",
                          index === selectedResult && "bg-[var(--panel-3)]",
                          c.passed ? "text-emerald-300" : "text-[var(--red)]"
                        )}
                      >
                        {c.passed ? "✓" : "✗"} {caseLabel(result.cases, index)}
                      </button>
                    ))}
                  </div>
                )}
                {current && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      {current.name} <span className="text-[var(--muted)]">· {current.ms} ms</span>
                    </p>
                    {current.input && <Block label="Input">{current.input}</Block>}
                    {current.expects.map((e, index) => (
                      <div key={index} className="grid gap-2 sm:grid-cols-2">
                        <Block label={e.label ? `Output · ${e.label}` : "Output"} tone={e.ok ? undefined : "bad"}>
                          {e.actual}
                        </Block>
                        <Block label="Expected" tone="ok">{e.expected}</Block>
                      </div>
                    ))}
                    {current.stdout && <Block label="Stdout">{current.stdout}</Block>}
                    {current.message && !current.expects.some((e) => !e.ok) && (
                      <Block label="Error" tone="bad">{current.message}</Block>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
