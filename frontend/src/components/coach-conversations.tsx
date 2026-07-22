"use client";

import { useMemo, useState } from "react";
import type { Conversation, Job } from "@/lib/types";
import { Badge, Button, cn } from "@/components/ui";
import { PlusIcon } from "@/components/coach/coach-icons";

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

type ConversationGroup = {
  label: string;
  items: Conversation[];
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function groupConversations(conversations: Conversation[]): ConversationGroup[] {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const buckets: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };

  for (const c of conversations) {
    const updated = startOfDay(new Date(c.updated_at));
    if (updated >= today) buckets.Today.push(c);
    else if (updated >= yesterday) buckets.Yesterday.push(c);
    else if (updated >= weekAgo) buckets["Previous 7 days"].push(c);
    else buckets.Older.push(c);
  }

  return (["Today", "Yesterday", "Previous 7 days", "Older"] as const)
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, items: buckets[label] }));
}

function ConversationRow({
  conversation: c,
  active,
  editing,
  renameDraft,
  onSelect,
  onStartRename,
  onRenameDraftChange,
  onSubmitRename,
  onCancelRename,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  editing: boolean;
  renameDraft: string;
  onSelect: () => void;
  onStartRename: () => void;
  onRenameDraftChange: (v: string) => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "coach-conv-row group relative rounded-lg transition-colors",
        active ? "bg-[color-mix(in_srgb,var(--primary)_14%,var(--panel-2))]" : "hover:bg-[var(--panel-2)]"
      )}
    >
      {active && (
        <span
          className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full"
          style={{ background: "var(--primary)" }}
          aria-hidden
        />
      )}

      {editing ? (
        <form
          className="px-3 py-2 pl-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitRename();
          }}
        >
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onBlur={onCancelRename}
            aria-label="Rename conversation"
            className="w-full rounded-md border bg-[var(--panel)] px-2 py-1.5 text-xs text-[var(--text)] outline-none focus-visible:ring-2"
            style={{
              borderColor: "var(--border-strong)",
              boxShadow: "0 0 0 2px transparent",
            }}
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className="w-full px-3 py-2.5 pl-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
          style={{ outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)" }}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="block min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
              {c.title}
            </span>
            {c.has_jd && (
              <span className="shrink-0 text-[10px]">
                <Badge tone="amber">JD</Badge>
              </span>
            )}
          </span>
          <span className="mt-1 block truncate text-[11px] leading-snug text-[var(--muted)]">
            {conversationSubtitle(c)}
          </span>
        </button>
      )}

      {!editing && (
        <div className="flex gap-2 px-3 pb-2 pl-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            className="text-[10px] font-medium text-[var(--muted)] hover:text-[var(--text)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-1"
            onClick={onStartRename}
          >
            Rename
          </button>
          {c.title !== "General" && (
            <button
              type="button"
              className="text-[10px] font-medium text-[var(--muted)] hover:text-[var(--red)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-1"
              onClick={onDelete}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
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

  const groups = useMemo(() => groupConversations(conversations), [conversations]);

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "h-full" : "")}>
      <div className="mb-3 shrink-0">
        <button
          type="button"
          onClick={onNew}
          className="btn-interactive flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--panel-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            borderColor: "var(--border-strong)",
            background: "var(--panel-2)",
            outlineColor: "color-mix(in srgb, var(--primary) 60%, transparent)",
          }}
        >
          <PlusIcon />
          New chat
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-0.5">
        {groups.length === 0 && (
          <p className="px-1 text-xs text-[var(--muted)]">No conversations yet.</p>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-2)]">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  editing={renamingId === c.id}
                  renameDraft={renameDraft}
                  onSelect={() => onSelect(c.id)}
                  onStartRename={() => {
                    setRenamingId(c.id);
                    setRenameDraft(c.title);
                  }}
                  onRenameDraftChange={setRenameDraft}
                  onSubmitRename={() => {
                    const t = renameDraft.trim();
                    if (t) onRename(c.id, t);
                    setRenamingId(null);
                  }}
                  onCancelRename={() => setRenamingId(null)}
                  onDelete={() => onDelete(c.id)}
                />
              ))}
            </div>
          </div>
        ))}
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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-conv-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl"
        style={{
          borderColor: "var(--border-strong)",
          background: "var(--panel)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <h2 id="new-conv-title" className="text-lg font-semibold tracking-tight">
          New conversation
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
          Optionally attach a job description so Coach tailors this thread to a specific
          interview or role.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("jd")}
            className={cn(
              "tab-pill rounded-lg border px-3 py-2 text-xs font-medium",
              mode === "jd"
                ? "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_12%,var(--panel-2))] text-[var(--text)]"
                : "border-[var(--border)] text-[var(--muted)]"
            )}
            data-active={mode === "jd"}
          >
            Paste JD
          </button>
          <button
            type="button"
            onClick={() => setMode("job")}
            className={cn(
              "tab-pill rounded-lg border px-3 py-2 text-xs font-medium",
              mode === "job"
                ? "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_12%,var(--panel-2))] text-[var(--text)]"
                : "border-[var(--border)] text-[var(--muted)]"
            )}
            data-active={mode === "job"}
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
            aria-label="Job description"
            className="input-field mt-4 w-full resize-y rounded-xl border bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: "var(--border-strong)" }}
          />
        ) : (
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : "")}
            aria-label="Saved job"
            className="input-field mt-4 w-full rounded-xl border bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none"
            style={{ borderColor: "var(--border-strong)" }}
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
          aria-label="Conversation title"
          className="input-field mt-3 w-full rounded-xl border bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none"
          style={{ borderColor: "var(--border-strong)" }}
        />

        <div className="mt-5 flex justify-end gap-2">
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
