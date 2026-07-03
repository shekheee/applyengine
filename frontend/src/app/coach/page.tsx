"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ChatMessage, Memory } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";
import { ResumeUpload } from "@/components/resume-upload";

const MEMORY_TONE: Record<string, "default" | "green" | "amber" | "red" | "primary"> = {
  skill: "primary",
  experience: "green",
  achievement: "green",
  preference: "amber",
  goal: "amber",
  fact: "default",
};

const STARTERS = [
  "Help me sharpen my resume summary.",
  "I led a project recently — help me turn it into a bullet.",
  "What roles should I be targeting?",
  "What's missing from my resume for senior ML roles?",
];

export default function CoachPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applyState, setApplyState] = useState<"idle" | "working" | "done">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const [m, mem] = await Promise.all([api.listMessages(), api.listMemories()]);
      setMessages(m);
      setMemories(mem);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load coach.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setInput("");
    setError("");
    const optimistic: ChatMessage = {
      id: Date.now(),
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const reply = await api.sendMessage(content);
      setMessages((prev) => [...prev, reply]);
      // Memory may have been updated from this exchange.
      setMemories(await api.listMemories());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send message.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  async function removeMemory(id: number) {
    await api.deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function updateResume() {
    setApplyState("working");
    setError("");
    try {
      await api.applyToResume();
      setApplyState("done");
      setTimeout(() => setApplyState("idle"), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update resume.");
      setApplyState("idle");
    }
  }

  if (loading) return <p className="text-[var(--muted)]">Loading coach…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Career coach</h1>
          <p className="text-sm text-[var(--muted)]">
            Talk it through. It remembers what matters and turns it into a stronger resume.
          </p>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/40">
          <p className="text-sm text-red-300">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Chat column */}
        <Card className="flex h-[62vh] flex-col p-0">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-[var(--primary)] text-2xl text-white">
                  ⚡
                </div>
                <p className="max-w-sm text-sm text-[var(--muted)]">
                  Hey — I&apos;m your career coach. Tell me what you&apos;ve been working on,
                  and I&apos;ll help you shape it into a resume that lands interviews.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--text)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "bg-[var(--primary)] text-white"
                      : "border bg-[var(--panel-2)] text-[var(--text)]"
                  }`}
                  style={m.role === "assistant" ? { borderColor: "var(--border)" } : {}}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl border bg-[var(--panel-2)] px-4 py-2.5 text-sm text-[var(--muted)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="inline-flex gap-1">
                    <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
                  </span>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 border-t p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Tell your coach something…"
              className="max-h-32 flex-1 resize-none rounded-lg border bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
              style={{ borderColor: "var(--border)" }}
            />
            <Button type="submit" disabled={sending || !input.trim()}>
              Send
            </Button>
          </form>
        </Card>

        {/* Memory sidebar */}
        <div className="space-y-4">
          <ResumeUpload compact />

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">What I&apos;ve learned</h2>
              <Badge tone="primary">{memories.length}</Badge>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Facts the coach remembers about you.
            </p>
            <div className="mt-4 space-y-2">
              {memories.length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  Nothing yet. Start chatting and I&apos;ll remember the important stuff.
                </p>
              )}
              {memories.map((m) => (
                <div
                  key={m.id}
                  className="group flex items-start justify-between gap-2 rounded-lg border p-2.5"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="min-w-0">
                    <Badge tone={MEMORY_TONE[m.kind] || "default"}>{m.kind}</Badge>
                    <p className="mt-1 text-sm text-[var(--text)]">{m.content}</p>
                  </div>
                  <button
                    onClick={() => removeMemory(m.id)}
                    className="shrink-0 text-[var(--muted)] opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
                    title="Forget this"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold">Update my resume</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Fold everything I&apos;ve learned into a fresh, improved resume profile.
            </p>
            <Button
              onClick={updateResume}
              disabled={applyState === "working"}
              className="mt-3 w-full"
              variant="outline"
            >
              {applyState === "working"
                ? "Updating…"
                : applyState === "done"
                  ? "✓ Resume updated"
                  : "Update my resume"}
            </Button>
            {applyState === "done" && (
              <p className="mt-2 text-xs text-emerald-300">
                Saved as your latest profile — used for new applications.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--muted)]"
      style={{ animationDelay: delay }}
    />
  );
}
