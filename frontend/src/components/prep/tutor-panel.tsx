"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { PrepTutorMessage } from "@/lib/types";
import { ChatMarkdown } from "@/components/chat-markdown";
import { Button, Card, Textarea, cn } from "@/components/ui";
import { MarkdownPanel } from "@/components/shared/markdown-panel";

/**
 * The after-attempt tutor: a review of the logged attempt (your approach vs the
 * ideal), then a thread for follow-up questions. One thread per attempt.
 */
export function TutorPanel({
  attemptId,
  solution,
  autoStart = false,
}: {
  attemptId: number;
  solution: string | null;
  autoStart?: boolean;
}) {
  const [messages, setMessages] = useState<PrepTutorMessage[] | null>(null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const send = (message: string) => {
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setStreaming("");
    if (message) {
      setMessages((m) => [
        ...(m ?? []),
        {
          id: -Date.now(),
          role: "user",
          content: message,
          model_served: "",
          created_at: new Date().toISOString(),
        },
      ]);
    }
    api
      .streamPrepTutor(
        attemptId,
        message,
        (token) => setStreaming((s) => (s ?? "") + token),
        controller.signal
      )
      .then((reply) => setMessages((m) => [...(m ?? []), reply]))
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setStreaming(null));
  };

  useEffect(() => {
    let cancelled = false;
    api
      .getPrepTutor(attemptId)
      .then((thread) => {
        if (cancelled) return;
        setMessages(thread);
        if (thread.length === 0 && autoStart && !started.current) {
          started.current = true;
          send("");
        }
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
      abort.current?.abort();
    };
    // `send` is stable for this attempt; re-running on it would re-trigger the review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, autoStart]);

  const ask = () => {
    const text = question.trim();
    if (!text || streaming !== null) return;
    setQuestion("");
    send(text);
  };

  const hasReview = (messages?.length ?? 0) > 0;
  const busy = streaming !== null;

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Review &amp; questions</h2>
          {messages?.[0]?.model_served && (
            <span className="text-xs text-[var(--muted)]">{messages[0].model_served}</span>
          )}
        </div>

        {messages === null && !error && (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        )}
        {messages !== null && !hasReview && !busy && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--muted)]">
              Get a review of this attempt: your approach vs the ideal, complexity, missed edge
              cases and one thing to drill.
            </p>
            <Button size="sm" onClick={() => send("")}>
              Review my attempt
            </Button>
          </div>
        )}

        <div className="space-y-4">
          {messages?.map((message) => (
            <div
              key={message.id}
              className={cn(
                message.role === "user" &&
                  "ml-auto max-w-[85%] rounded-[var(--radius-md)] bg-[var(--panel-2)] px-3 py-2"
              )}
            >
              {message.role === "user" ? (
                <p className="whitespace-pre-wrap text-sm text-[var(--text)]">{message.content}</p>
              ) : (
                <ChatMarkdown content={message.content} density="compact" />
              )}
            </div>
          ))}
          {busy && (
            <div aria-live="polite">
              {streaming ? (
                <ChatMarkdown content={streaming} density="compact" />
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  {hasReview ? "Thinking…" : "Reviewing your attempt…"}
                </p>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-[var(--red)]">{error}</p>}

        {hasReview && (
          <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <label htmlFor={`tutor-q-${attemptId}`} className="text-xs font-medium text-[var(--muted)]">
              Ask about this problem
            </label>
            <Textarea
              value={question}
              onChange={setQuestion}
              rows={3}
              placeholder="e.g. Why does the sliding window work here? Show me the brute force first."
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={ask} disabled={busy || !question.trim()}>
                {busy ? "Answering…" : "Ask"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {solution && (
        <MarkdownPanel title="Ideal solution" markdown={solution} collapsible defaultOpen={false} />
      )}
    </div>
  );
}
