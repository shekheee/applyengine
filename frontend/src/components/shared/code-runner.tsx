"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, cn } from "@/components/ui";

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js";

export type RunnerTest = { name: string; code: string };

type TestResult = { name: string; passed: boolean; message?: string };

type RunResult = {
  stdout: string;
  stderr: string;
  error: string | null;
  results: TestResult[];
  timedOut?: boolean;
  ms: number;
};

type Status = "idle" | "loading" | "running";

/*
 * Runs in a Web Worker so a runaway loop can be killed with terminate().
 * Each run gets a fresh globals dict; tests run afterwards in the same dict
 * and pass when they raise nothing.
 */
const WORKER_SOURCE = `
importScripts(${JSON.stringify(PYODIDE_URL)});
const ready = loadPyodide();
ready.then(() => self.postMessage({ type: "ready" }), (e) => self.postMessage({ type: "load-error", error: String(e) }));

function clean(err) {
  // Keep only the user's frames: everything from the first <exec> frame on.
  const lines = String((err && err.message) || err).split("\\n");
  const first = lines.findIndex((line) => line.includes('File "<exec>"'));
  if (first === -1) return lines.join("\\n").trim();
  return ["Traceback (most recent call last):", ...lines.slice(first)].join("\\n").trim();
}

self.onmessage = async (event) => {
  const { id, code, tests } = event.data;
  const py = await ready;
  const out = [];
  const err = [];
  py.setStdout({ batched: (s) => out.push(s) });
  py.setStderr({ batched: (s) => err.push(s) });
  const ns = py.globals.get("dict")();
  let error = null;
  const results = [];
  try {
    await py.loadPackagesFromImports(code, { messageCallback: () => {} });
    await py.runPythonAsync(code, { globals: ns });
  } catch (e) {
    error = clean(e);
  }
  if (!error && tests) {
    for (const test of tests) {
      try {
        await py.runPythonAsync(test.code, { globals: ns });
        results.push({ name: test.name, passed: true });
      } catch (e) {
        const lines = clean(e).split("\\n");
        results.push({ name: test.name, passed: false, message: lines[lines.length - 1] });
      }
    }
  }
  ns.destroy();
  self.postMessage({ type: "result", id, stdout: out.join("\\n"), stderr: err.join("\\n"), error, results });
};
`;

function createWorker(): Worker {
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}

/**
 * Runs Python in the browser via Pyodide, loaded on the first run.
 * Shows stdout, stderr and optional test results.
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
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = () => {
    let worker = workerRef.current;
    if (!worker) {
      worker = createWorker();
      workerRef.current = worker;
      loadedRef.current = false;
    }
    const id = Date.now();
    const started = performance.now();
    setStatus(loadedRef.current ? "running" : "loading");
    setLoadError(null);

    // The clock only starts once Pyodide is loaded; a first load can take a while.
    let timer: number | undefined;
    const arm = () => {
      timer = window.setTimeout(() => {
        worker?.terminate();
        workerRef.current = null;
        setStatus("idle");
        setResult({
          stdout: "",
          stderr: "",
          error: null,
          results: [],
          timedOut: true,
          ms: Math.round(performance.now() - started),
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
        setResult({ ...data, ms: Math.round(performance.now() - started) });
      }
    };
    worker.postMessage({ id, code, tests });
  };

  const passed = result?.results.filter((r) => r.passed).length ?? 0;
  const busy = status !== "idle";

  return (
    <div
      className="rounded-[var(--radius-md)] border bg-[var(--panel)]"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={run} disabled={busy || !code.trim()}>
            {status === "loading" ? "Loading Python…" : status === "running" ? "Running…" : "Run"}
          </Button>
          {result && !result.timedOut && (
            <span className="text-xs tabular-nums text-[var(--muted)]">{result.ms} ms</span>
          )}
        </div>
        {result && result.results.length > 0 && (
          <Badge tone={passed === result.results.length ? "green" : "red"}>
            {passed}/{result.results.length} tests passed
          </Badge>
        )}
      </div>
      <div className="max-h-72 overflow-auto p-3 font-mono text-xs leading-5" aria-live="polite">
        {loadError && <p className="text-[var(--red)]">{loadError}</p>}
        {!result && !loadError && (
          <p className="text-[var(--muted)]">
            {status === "loading"
              ? "Downloading Python (first run only)…"
              : "Output appears here. Python runs in your browser."}
          </p>
        )}
        {result?.timedOut && (
          <p className="text-[var(--red)]">
            Stopped after {Math.round(timeoutMs / 1000)} s. Infinite loop?
          </p>
        )}
        {result?.stdout && <pre className="whitespace-pre-wrap text-[var(--text)]">{result.stdout}</pre>}
        {result?.stderr && <pre className="whitespace-pre-wrap text-amber-300">{result.stderr}</pre>}
        {result?.error && <pre className="whitespace-pre-wrap text-[var(--red)]">{result.error}</pre>}
        {result && !result.timedOut && !result.stdout && !result.stderr && !result.error && result.results.length === 0 && (
          <p className="text-[var(--muted)]">Ran with no output.</p>
        )}
        {result && result.results.length > 0 && (
          <ul className="mt-2 space-y-1">
            {result.results.map((test) => (
              <li key={test.name} className={cn(test.passed ? "text-emerald-300" : "text-[var(--red)]")}>
                {test.passed ? "✓" : "✗"} {test.name}
                {test.message && <span className="text-[var(--muted)]"> — {test.message}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
