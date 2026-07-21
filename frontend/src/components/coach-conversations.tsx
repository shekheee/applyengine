"use client";

import { useState } from "react";
import type { Conversation, Job } from "@/lib/types";
import { Badge, Button, cn } from "@/components/ui";

const ACTIVE_CONV_KEY = "applyengine_active_conversation";

export function getStoredConversationId(): number | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(ACTIVE_CONV_KEY);
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function storeConversationId(id: number | null) {
  if (typeof window === "undefined") return;
  if (id == null) window.localStorage.removeItem(ACTIVE_CONV_KEY);
  else window.localStorage.setItem(ACTIVE_CONV_KEY, String(id));
}

export function conversationSubtitle(c: Conversation): string {
  if (c.job_title && c.job_company) return `${c.job_title} @ ${c.job_company}`;
  if (c.job_title || c.job_company) return c.job_title || c.job_company;
  if (c.has_jd && c.jd_preview) return c.jd_preview;
  return c.message_preview || "No messages yet";
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  compact,
}: {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
  compact?: boolean;
}) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "h-full" : "")}>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Conversations
        </p>
        <Button size="sm" variant="outline" onClick={onNew}>
          + New
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {conversations.map((c) => {
          const active = c.id === activeId;
          const editing = renamingId === c.id;
          return (
            <div
              key={c.id}
              className={cn(
                "group rounded-lg border px-2.5 py-2 transition-colors",
                active
                  ? "border-[var(--primary)] bg-[var(--primary)]/10"
                  : "border-transparent hover:border-[var(--border)] hover:bg-[var(--panel-2)]"
              )}
            >
              {editing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = renameDraft.trim();
                    if (t) onRename(c.id, t);
                    setRenamingId(null);
                  }}
                >
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => setRenamingId(null)}
                    className="w-full rounded border bg-[var(--panel)] px-2 py-1 text-xs"
                    style={{ borderColor: "var(--border)" }}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="w-full text-left"
                >
                  <span className="block truncate text-sm font-medium">{c.title}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">
                    {conversationSubtitle(c)}
                  </span>
                  {c.has_jd && (
                    <span className="mt-1 inline-block">
                      <Badge tone="amber">JD</Badge>
                    </span>
                  )}
                </button>
              )}
              {!editing && (
                <div className="mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    className="text-[10px] text-[var(--muted)] hover:text-[var(--text)]"
                    onClick={() => {
                      setRenamingId(c.id);
                      setRenameDraft(c.title);
                    }}
                  >
                    Rename
                  </button>
                  {c.title !== "General" && (
                    <button
                      type="button"
                      className="text-[10px] text-[var(--muted)] hover:text-red-300"
                      onClick={() => onDelete(c.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NewConversationDialog({
  open,
  onClose,
  onCreate,
  jobs,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (opts: { title?: string; job_id?: number; jd_text?: string }) => void;
  jobs: Job[];
  busy?: boolean;
}) {
  const [mode, setMode] = useState<"jd" | "job">("jd");
  const [jdText, setJdText] = useState("");
  const [jobId, setJobId] = useState<number | "">("");
  const [title, setTitle] = useState("");

  if (!open) return null;

  function submit() {
    if (mode === "job" && jobId !== "") {
      onCreate({ title: title || undefined, job_id: Number(jobId) });
    } else if (mode === "jd" && jdText.trim()) {
      onCreate({ title: title || undefined, jd_text: jdText.trim() });
    } else {
      onCreate({ title: title || undefined });
    }
    setJdText("");
    setJobId("");
    setTitle("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-lg rounded-xl border bg-[var(--panel)] p-5 shadow-xl"
        style={{ borderColor: "var(--border)" }}
      >
        <h2 className="text-lg font-semibold">New conversation</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Optionally attach a job description so Coach tailors this thread to a specific
          interview or role.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("jd")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium",
              mode === "jd"
                ? "border-[var(--primary)] bg-[var(--primary)]/10"
                : "border-[var(--border)]"
            )}
          >
            Paste JD
          </button>
          <button
            type="button"
            onClick={() => setMode("job")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium",
              mode === "job"
                ? "border-[var(--primary)] bg-[var(--primary)]/10"
                : "border-[var(--border)]"
            )}
          >
            Saved job
          </button>
        </div>

        {mode === "jd" ? (
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            rows={6}
            placeholder="Paste the job description here…"
            className="mt-3 w-full resize-y rounded-lg border bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            style={{ borderColor: "var(--border)" }}
          />
        ) : (
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : "")}
            className="mt-3 w-full rounded-lg border bg-[var(--panel-2)] px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            <option value="">Select a saved job…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} @ {j.company}
              </option>
            ))}
          </select>
        )}

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional — auto-generated if blank)"
          className="mt-3 w-full rounded-lg border bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          style={{ borderColor: "var(--border)" }}
        />

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create conversation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
