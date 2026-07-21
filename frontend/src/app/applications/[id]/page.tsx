"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  STATUSES,
  STATUS_LABELS,
  type Application,
  type Job,
  type Status,
} from "@/lib/types";
import { Badge, Button, Card, ScoreRing } from "@/components/ui";

type Tab = "resume" | "cover_letter" | "interview_prep";

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();

  const [app, setApp] = useState<Application | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<Tab>("resume");
  const [genBusy, setGenBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const a = await api.getApplication(id);
      setApp(a);
      setNotes(a.notes);
      setJob(await api.getJob(a.job_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    if (!Number.isNaN(id)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function generateAll() {
    if (!app) return;
    setGenBusy(true);
    try {
      setApp(
        await api.generate(app.id, ["resume", "cover_letter", "interview_prep"])
      );
    } finally {
      setGenBusy(false);
    }
  }

  async function changeStatus(status: Status) {
    if (!app) return;
    setApp(await api.setStatus(app.id, status));
  }

  async function saveNotes() {
    if (!app) return;
    setApp(await api.setNotes(app.id, notes));
  }

  async function openRoleChat() {
    if (!app) return;
    setChatBusy(true);
    setError("");
    try {
      const conv = await api.getOrCreateApplicationConversation(app.id);
      router.push(`/coach?conversation_id=${conv.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open role chat.");
    } finally {
      setChatBusy(false);
    }
  }

  if (error)
    return <Card className="border-red-500/40"><p className="text-red-300">{error}</p></Card>;
  if (!app || !job) return <p className="text-[var(--muted)]">Loading…</p>;

  const coverage = Math.round((app.keyword_coverage ?? 0) * 100);
  const tabContent: Record<Tab, string> = {
    resume: app.tailored_resume,
    cover_letter: app.cover_letter,
    interview_prep: app.interview_prep,
  };
  const hasContent = tabContent[tab]?.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button href="/" variant="ghost" size="sm">
            ← Pipeline
          </Button>
          <h1 className="mt-1 text-2xl font-semibold">{job.title}</h1>
          <p className="text-[var(--muted)]">
            {job.company} {job.location && `· ${job.location}`}{" "}
            {job.seniority && job.seniority !== "unknown" && `· ${job.seniority}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={openRoleChat} disabled={chatBusy} variant="outline" size="sm">
            {chatBusy ? "Opening…" : "💬 Chat about this role"}
          </Button>
          <select
          value={app.status}
          onChange={(e) => changeStatus(e.target.value as Status)}
          className="rounded-lg border bg-[var(--panel-2)] px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border)" }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex items-center gap-4">
            <ScoreRing score={app.fit_score} />
            <div className="flex-1">
              <p className="text-sm font-medium">ATS keyword coverage</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--panel-2)]">
                <div
                  className="h-full rounded-full bg-[var(--primary)]"
                  style={{ width: `${coverage}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {coverage}% of scanned keywords matched
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-emerald-300">
                Matched ({app.matched_keywords.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {app.matched_keywords.map((k) => (
                  <Badge key={k} tone="green">
                    {k}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-red-300">
                Missing ({app.missing_keywords.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {app.missing_keywords.map((k) => (
                  <Badge key={k} tone="red">
                    {k}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-2 font-medium">Gap analysis</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]/90">
            {app.gap_analysis || "No analysis yet."}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {(
              [
                ["resume", "Tailored resume"],
                ["cover_letter", "Cover letter"],
                ["interview_prep", "Interview prep"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  tab === key
                    ? "bg-[var(--panel-2)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {tab !== "interview_prep" && hasContent && (
              <Button
                href={api.exportUrl(app.id, tab)}
                variant="outline"
                size="sm"
              >
                ↓ Export .docx
              </Button>
            )}
            <Button onClick={generateAll} disabled={genBusy} size="sm">
              {genBusy ? "Generating…" : "✨ Generate all"}
            </Button>
          </div>
        </div>

        <div className="mt-4 min-h-[240px] rounded-lg border bg-[var(--panel-2)] p-4">
          {hasContent ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {tabContent[tab]}
            </pre>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Nothing generated yet — hit “Generate all”.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-medium">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Recruiter name, referral, follow-up dates…"
          className="w-full resize-y rounded-lg border bg-[var(--panel-2)] p-3 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
          style={{ borderColor: "var(--border)" }}
        />
      </Card>
    </div>
  );
}
