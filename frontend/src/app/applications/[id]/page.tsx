"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  STATUSES,
  STATUS_LABELS,
  type Application,
  type Job,
  type Status,
} from "@/lib/types";
import { Badge, Button, Card, ScoreRing, TabBar } from "@/components/ui";
import { AppIcon } from "@/components/app-icon";
import { CoachChat } from "@/components/coach-chat";
import { ResumeWorkspace } from "@/components/resume-workspace";
import { InterviewPractice } from "@/components/interview-practice";

type HubTab = "chat" | "resume" | "interview" | "materials";

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [app, setApp] = useState<Application | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<HubTab>("chat");
  const [genBusy, setGenBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [materialsTab, setMaterialsTab] = useState<"cover_letter" | "interview_prep">(
    "cover_letter"
  );

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

  if (error)
    return (
      <Card className="border-red-500/40 animate-fade-up">
        <p className="text-red-300">{error}</p>
      </Card>
    );
  if (!app || !job)
    return <p className="text-[var(--muted)]">Loading application…</p>;

  const coverage = Math.round((app.keyword_coverage ?? 0) * 100);
  const jobLabel = `${job.title} @ ${job.company}`;
  const materialsContent =
    materialsTab === "cover_letter" ? app.cover_letter : app.interview_prep;

  return (
    <div className="animate-fade-up space-y-6">
      {/* Hero header */}
      <div
        className="relative overflow-hidden rounded-2xl border p-5 sm:p-6"
        style={{
          borderColor: "var(--border)",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, var(--panel)) 0%, var(--panel) 45%, color-mix(in srgb, var(--green) 6%, var(--panel)) 100%)",
        }}
      >
        <div className="pointer-events-none absolute -right-8 -top-8 opacity-20">
          <AppIcon name="company" size={120} />
        </div>
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Button href="/" variant="ghost" size="sm">
              ← Pipeline
            </Button>
            <div className="mt-2 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-[var(--panel-2)]">
                <AppIcon name="company" size={24} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                  {job.title}
                </h1>
                <p className="text-[var(--muted)]">
                  {job.company}
                  {job.location && ` · ${job.location}`}
                  {job.seniority && job.seniority !== "unknown" && ` · ${job.seniority}`}
                </p>
              </div>
            </div>
          </div>
          <select
            value={app.status}
            onChange={(e) => changeStatus(e.target.value as Status)}
            className="rounded-lg border bg-[var(--panel-2)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--primary)]"
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

      {/* Fit snapshot */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card interactive className="lg:col-span-1">
          <div className="flex items-center gap-4">
            <ScoreRing score={app.fit_score} />
            <div className="flex-1">
              <p className="text-sm font-medium">Role fit</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--panel-2)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-2)] transition-all duration-500"
                  style={{ width: `${coverage}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {coverage}% keyword coverage
              </p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-300">
                Matched ({app.matched_keywords.length})
              </p>
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {app.matched_keywords.length ? (
                  app.matched_keywords.map((k) => (
                    <Badge key={k} tone="green">
                      {k}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-[var(--muted)]">None yet</span>
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-red-300">
                Gaps ({app.missing_keywords.length})
              </p>
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {app.missing_keywords.length ? (
                  app.missing_keywords.map((k) => (
                    <Badge key={k} tone="red">
                      {k}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-[var(--muted)]">None flagged</span>
                )}
              </div>
            </div>
          </div>
          {app.gap_analysis && (
            <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-[var(--text)]/85">
              {app.gap_analysis}
            </p>
          )}
        </Card>
      </div>

      {/* Main hub tabs */}
      <div className="space-y-4">
        <TabBar
          active={tab}
          onChange={setTab}
          tabs={[
            {
              id: "chat",
              label: "Chat",
              icon: <AppIcon name="chat" size={18} />,
            },
            {
              id: "resume",
              label: "Resume",
              icon: <AppIcon name="resume" size={18} />,
            },
            {
              id: "interview",
              label: "Interview",
              icon: <AppIcon name="interview" size={18} />,
            },
            {
              id: "materials",
              label: "Materials",
              icon: <AppIcon name="spark" size={18} />,
            },
          ]}
        />

        {tab === "chat" && (
          <Card className="overflow-hidden p-0">
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <p className="text-sm text-[var(--muted)]">
                Role-scoped Coach thread — same conversation appears in{" "}
                <Link href="/coach" className="text-[var(--primary-2)] underline hover:text-[var(--text)]">
                  Coach
                </Link>{" "}
                sidebar.
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <CoachChat embedded applicationId={app.id} />
            </div>
          </Card>
        )}

        {tab === "resume" && (
          <Card>
            <ResumeWorkspace
              variant="application"
              lockedJobId={job.id}
              lockedJobLabel={jobLabel}
            />
          </Card>
        )}

        {tab === "interview" && (
          <Card>
            <InterviewPractice
              embedded
              initialJobId={job.id}
              jobLabel={jobLabel}
            />
          </Card>
        )}

        {tab === "materials" && (
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Application materials</h2>
                <p className="text-sm text-[var(--muted)]">
                  ATS-tailored text exports for this application.
                </p>
              </div>
              <Button onClick={generateAll} disabled={genBusy} size="sm">
                {genBusy ? "Generating…" : "✨ Generate all"}
              </Button>
            </div>
            <div className="mb-3 flex gap-1">
              {(
                [
                  ["cover_letter", "Cover letter"],
                  ["interview_prep", "Interview prep notes"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMaterialsTab(key)}
                  className={`tab-pill rounded-lg px-3 py-1.5 text-sm ${
                    materialsTab === key
                      ? "bg-[var(--panel-2)] text-[var(--text)]"
                      : "text-[var(--muted)]"
                  }`}
                  data-active={materialsTab === key}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-[200px] rounded-xl border bg-[var(--panel-2)] p-4">
              {materialsContent?.trim() ? (
                <>
                  {materialsTab === "cover_letter" && (
                    <div className="mb-3 flex justify-end">
                      <Button
                        href={api.exportUrl(app.id, "cover_letter")}
                        variant="outline"
                        size="sm"
                      >
                        ↓ Export .docx
                      </Button>
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {materialsContent}
                  </pre>
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Nothing generated yet — hit “Generate all” for cover letter and prep notes.
                </p>
              )}
            </div>
          </Card>
        )}
      </div>

      <Card>
        <h2 className="mb-2 font-medium">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Recruiter name, referral, follow-up dates…"
          className="w-full resize-y rounded-lg border bg-[var(--panel-2)] p-3 text-sm outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
          style={{ borderColor: "var(--border)" }}
        />
      </Card>
    </div>
  );
}
