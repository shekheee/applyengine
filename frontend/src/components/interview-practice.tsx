"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type {
  CoachModel,
  DeliveryMetrics,
  InterviewCurriculum,
  InterviewProgress,
  InterviewSession,
  InterviewTurn,
  Job,
  Profile,
} from "@/lib/types";
import {
  INTERVIEW_DIFFICULTY,
  INTERVIEW_FOCUS,
  curriculumTopicLabel,
} from "@/lib/types";
import { Badge, Button, Card, cn } from "@/components/ui";
import { ChatMarkdown } from "@/components/chat-markdown";
import { InterviewCurriculumPanel } from "@/components/interview-curriculum";
import { InterviewProgressPanel } from "@/components/interview-progress";
import { ModelSelector, getStoredModelId, storeModelId } from "@/components/model-selector";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";

function summaryMarkdown(summary: InterviewSession["summary"]): string {
  const lines = [
    `## Session complete · **${summary.overall_score ?? "—"}/10**`,
    "",
  ];
  if (summary.strengths?.length) {
    lines.push("### Top strengths");
    summary.strengths.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (summary.priority_improvements?.length) {
    lines.push("### Priority improvements");
    summary.priority_improvements.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (summary.recurring_weaknesses?.length) {
    lines.push("### Recurring patterns");
    summary.recurring_weaknesses.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (summary.skill_pointers?.length) {
    lines.push("### Skill enhancement pointers");
    summary.skill_pointers.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (summary.next_steps?.length) {
    lines.push("### Next steps");
    summary.next_steps.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (summary.per_question?.length) {
    lines.push("### Question scores");
    summary.per_question.forEach((pq) => {
      const topicNote = pq.topic ? ` · ${curriculumTopicLabel(pq.topic)}` : "";
      lines.push(
        `- **${pq.score ?? "—"}/10**${topicNote} — ${(pq.question ?? "").slice(0, 80)}… _${pq.key_feedback ?? ""}_`
      );
    });
  }
  if (summary.topic_scores && Object.keys(summary.topic_scores).length > 0) {
    lines.push("");
    lines.push("### AI/ML topic scores");
    Object.entries(summary.topic_scores).forEach(([tid, sc]) => {
      lines.push(`- **${curriculumTopicLabel(tid)}:** ${sc}/10`);
    });
  }
  return lines.join("\n").trim();
}

function turnsForQuestion(turns: InterviewTurn[], idx: number): InterviewTurn[] {
  return turns.filter((t) => t.question_index === idx);
}

function hasFeedbackForQuestion(turns: InterviewTurn[], idx: number): boolean {
  return turns.some((t) => t.question_index === idx && t.role === "feedback");
}

export function InterviewPractice({
  initialJobId,
  embedded = false,
  jobLabel,
}: {
  initialJobId?: number;
  embedded?: boolean;
  jobLabel?: string;
} = {}) {
  const [phase, setPhase] = useState<"setup" | "practice" | "summary">("setup");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [models, setModels] = useState<CoachModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [pastSessions, setPastSessions] = useState<InterviewSession[]>([]);
  const [progress, setProgress] = useState<InterviewProgress | null>(null);

  const [focus, setFocus] = useState("mixed");
  const [difficulty, setDifficulty] = useState("mid");
  const [jobId, setJobId] = useState<number | "">(initialJobId ?? "");
  const [curriculumTopic, setCurriculumTopic] = useState("");
  const [curriculum, setCurriculum] = useState<InterviewCurriculum | null>(null);
  const [showStudyGuide, setShowStudyGuide] = useState(false);
  const [showMlTrack, setShowMlTrack] = useState(false);

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [followup, setFollowup] = useState("");
  const [streamText, setStreamText] = useState("");
  const [liveFeedback, setLiveFeedback] = useState("");
  const [deliveryMetrics, setDeliveryMetrics] = useState<DeliveryMetrics | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  const voice = useVoiceRecorder();
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [base, jobList, modelData, sessions, prog, curr] = await Promise.all([
          api.baseProfile().catch(() => null),
          api.listJobs(),
          api.listCoachModels(),
          api.listInterviewSessions().catch(() => []),
          api.getInterviewProgress().catch(() => null),
          api.getInterviewCurriculum().catch(() => null),
        ]);
        setProfile(base);
        setJobs(jobList);
        setModels(modelData.models);
        setPastSessions(sessions);
        setProgress(prog);
        setCurriculum(curr);
        if (curr?.ml_profile_detected) {
          setShowMlTrack(true);
        }
        const stored = getStoredModelId();
        const valid =
          stored && modelData.models.some((x) => x.id === stored)
            ? stored
            : modelData.default_model;
        setSelectedModel(valid);
        if (valid) storeModelId(valid);
        if (initialJobId != null) setJobId(initialJobId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [initialJobId]);

  useEffect(() => {
    scrollToBottom();
  }, [session, streamText, liveFeedback, scrollToBottom]);

  async function startSession() {
    if (!profile) {
      setError("Upload your base resume in Coach before starting.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const s = await api.createInterviewSession({
        focus,
        difficulty,
        job_id: jobId === "" ? null : jobId,
        model: selectedModel || undefined,
        curriculum_topic: curriculumTopic || undefined,
      });
      setSession(s);
      setAnswer("");
      setFollowup("");
      setLiveFeedback("");
      setDeliveryMetrics(null);
      setPhase("practice");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start session.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer() {
    if (!session || !answer.trim() || streaming) return;
    setError("");
    setStreaming(true);
    setStreamText("");
    setLiveFeedback("");
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const { turn } = await api.submitInterviewAnswerStream(
        session.id,
        answer.trim(),
        (token) => {
          setStreamText((prev) => prev + token);
          setLiveFeedback((prev) => prev + token);
        },
        {
          question_index: session.current_index,
          model: selectedModel || undefined,
          signal: abortRef.current.signal,
        }
      );
      const updated = await api.getInterviewSession(session.id);
      setSession(updated);
      setAnswer("");
      setDeliveryMetrics(null);
      setLiveFeedback(turn.content);
      setStreamText("");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Feedback failed.");
      }
    } finally {
      setStreaming(false);
    }
  }

  async function sendFollowup() {
    if (!session || !followup.trim() || streaming) return;
    setError("");
    setStreaming(true);
    setStreamText("");
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const msg = followup.trim();
    setFollowup("");

    try {
      await api.interviewFollowupStream(
        session.id,
        msg,
        (token) => setStreamText((prev) => prev + token),
        {
          question_index: session.current_index,
          model: selectedModel || undefined,
          signal: abortRef.current.signal,
        }
      );
      const updated = await api.getInterviewSession(session.id);
      setSession(updated);
      setStreamText("");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Follow-up failed.");
      }
    } finally {
      setStreaming(false);
    }
  }

  async function goNext() {
    if (!session) return;
    setError("");
    setBusy(true);
    setLiveFeedback("");
    try {
      const updated = await api.nextInterviewQuestion(session.id);
      setSession(updated);
      setAnswer("");
      setFollowup("");
      setDeliveryMetrics(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not advance.");
    } finally {
      setBusy(false);
    }
  }

  async function finishSession() {
    if (!session) return;
    setError("");
    setBusy(true);
    try {
      const updated = await api.completeInterviewSession(
        session.id,
        selectedModel || undefined
      );
      setSession(updated);
      setPhase("summary");
      const sessions = await api.listInterviewSessions();
      setPastSessions(sessions);
      const prog = await api.getInterviewProgress().catch(() => null);
      setProgress(prog);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete session.");
    } finally {
      setBusy(false);
    }
  }

  function resetToSetup() {
    setSession(null);
    setPhase("setup");
    setAnswer("");
    setFollowup("");
    setLiveFeedback("");
    setStreamText("");
    setDeliveryMetrics(null);
    setError("");
  }

  async function handleMicClick() {
    if (voice.state === "recording") {
      setTranscribing(true);
      voice.setError(null);
      try {
        const recorded = await voice.finishRecording();
        if (!recorded || recorded.blob.size < 100) {
          voice.setError("Recording too short. Try again.");
          return;
        }
        const result = await api.transcribeInterviewAudio(
          recorded.blob,
          recorded.mime,
          recorded.duration
        );
        setAnswer(result.text);
        setDeliveryMetrics(result.delivery);
      } catch (e) {
        voice.setError(e instanceof Error ? e.message : "Transcription failed.");
      } finally {
        setTranscribing(false);
      }
      return;
    }
    if (voice.state === "processing" || transcribing) return;
    setDeliveryMetrics(null);
    await voice.startRecording();
  }

  function onAnswerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitAnswer();
    }
  }

  if (loading) {
    return <p className="text-[var(--muted)]">Loading interview practice…</p>;
  }

  const currentQ = session?.questions[session.current_index];
  const totalQ = session?.questions.length ?? 0;
  const qTurns = session ? turnsForQuestion(session.turns, session.current_index) : [];
  const answered = session
    ? hasFeedbackForQuestion(session.turns, session.current_index)
    : false;
  const isLast =
    session != null && session.current_index >= (session.questions.length - 1);

  return (
    <div className={embedded ? "space-y-4" : "space-y-6"}>
      {!embedded && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Interview Practice</h1>
            <p className="text-sm text-[var(--muted)]">
              Tailored questions from your resume
              {jobId !== "" ? " and target role" : ""} with actionable feedback.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {models.length > 0 && (
              <ModelSelector
                models={models}
                selectedId={selectedModel}
                onChange={setSelectedModel}
                disabled={busy || streaming}
              />
            )}
          </div>
        </div>
      )}

      {embedded && phase === "setup" && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Prepare for interview</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Questions and feedback scoped to{" "}
              {jobLabel ? (
                <strong className="text-[var(--text)]">{jobLabel}</strong>
              ) : (
                "this role"
              )}
              , grounded in your resume.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {models.length > 0 && (
              <ModelSelector
                models={models}
                selectedId={selectedModel}
                onChange={setSelectedModel}
                disabled={busy || streaming}
              />
            )}
            <Button href="/interview" variant="outline" size="sm">
              Full practice →
            </Button>
          </div>
        </div>
      )}

      {!profile && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <p className="text-sm">
            Upload your <strong>base resume</strong> on the{" "}
            <Link href="/resume" className="text-[var(--primary-2)] underline">
              Resume
            </Link>{" "}
            page before starting. Questions and feedback are grounded in your real profile.
          </p>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {(phase === "setup" || progress?.completed_sessions) && !embedded ? (
        <InterviewProgressPanel progress={progress} />
      ) : null}

      {phase === "setup" && (
        <div className={embedded ? "space-y-4" : "grid gap-6 lg:grid-cols-[1fr_280px]"}>
          <Card className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">Focus area</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {INTERVIEW_FOCUS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFocus(f.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left transition-colors",
                      focus === f.id
                        ? "border-[var(--primary)] bg-[var(--primary)]/10"
                        : "border-[var(--border)] hover:bg-[var(--panel-2)]"
                    )}
                  >
                    <span className="block text-sm font-medium">{f.label}</span>
                    <span className="block text-xs text-[var(--muted)]">{f.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Difficulty</p>
              <div className="flex flex-wrap gap-2">
                {INTERVIEW_DIFFICULTY.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDifficulty(d.id)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                      difficulty === d.id
                        ? "border-[var(--primary)] bg-[var(--primary)]/10"
                        : "border-[var(--border)] hover:bg-[var(--panel-2)]"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {curriculum && (
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                {!showMlTrack && !curriculum.ml_profile_detected ? (
                  <button
                    type="button"
                    onClick={() => setShowMlTrack(true)}
                    className="text-sm text-[var(--primary-2)] hover:underline"
                  >
                    + AI/ML Engineering prep track (optional)
                  </button>
                ) : (
                  <>
                    {!curriculum.ml_profile_detected && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMlTrack(false);
                          setCurriculumTopic("");
                        }}
                        className="mb-2 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        Hide AI/ML track
                      </button>
                    )}
                    <InterviewCurriculumPanel
                      curriculum={curriculum}
                      selectedTopic={curriculumTopic}
                      onSelectTopic={setCurriculumTopic}
                      showStudyGuide={showStudyGuide}
                      onToggleStudyGuide={() => setShowStudyGuide((v) => !v)}
                    />
                  </>
                )}
              </div>
            )}

            {initialJobId == null ? (
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Target role (optional)
                </label>
                <select
                  value={jobId}
                  onChange={(e) =>
                    setJobId(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-full rounded-lg border bg-[var(--panel-2)] px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  <option value="">General (resume only)</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} @ {j.company}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
                Session will use this application&apos;s job description for tailored questions.
              </p>
            )}

            <Button
              onClick={startSession}
              disabled={!profile || busy}
              className="w-full sm:w-auto"
            >
              {busy
                ? "Generating questions…"
                : embedded
                  ? "▶ Prepare for interview"
                  : "Start practice session"}
            </Button>
          </Card>

          {!embedded && (
          <div className="space-y-4">
            {profile && (
              <Card>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Base resume
                </p>
                <p className="text-sm font-medium">{profile.name || "Your profile"}</p>
                <p className="mt-1 line-clamp-3 text-xs text-[var(--muted)]">
                  {profile.summary || profile.raw_text?.slice(0, 160)}
                </p>
              </Card>
            )}
            {pastSessions.length > 0 && (
              <Card>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Recent sessions
                </p>
                <ul className="space-y-2">
                  {pastSessions.slice(0, 5).map((s) => (
                    <li key={s.id} className="text-xs">
                      <button
                        type="button"
                        className="w-full rounded-lg border px-2 py-1.5 text-left hover:bg-[var(--panel-2)]"
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => {
                          setSession(s);
                          setPhase(s.status === "completed" ? "summary" : "practice");
                        }}
                      >
                        <span className="font-medium capitalize">{s.focus}</span>
                        <span className="text-[var(--muted)]">
                          {" "}
                          · {s.status}
                          {s.summary?.overall_score != null &&
                            ` · ${s.summary.overall_score}/10`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          )}
        </div>
      )}

      {phase === "practice" && session && currentQ && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">
                Q{session.current_index + 1} / {totalQ}
              </Badge>
              <Badge>
                {session.curriculum_topic
                  ? curriculumTopicLabel(currentQ.category)
                  : currentQ.category}
              </Badge>
              {session.curriculum_topic && (
                <Badge tone="green">{curriculumTopicLabel(session.curriculum_topic)} track</Badge>
              )}
              <Badge tone="default">{session.difficulty}</Badge>
              {session.job_id && (
                <Badge tone="amber">
                  {jobs.find((j) => j.id === session.job_id)?.company ?? "Target role"}
                </Badge>
              )}
            </div>

            <Card>
              <p className="text-lg font-medium leading-snug">{currentQ.text}</p>
              {currentQ.tip && (
                <p className="mt-2 text-sm text-[var(--muted)]">Tip: {currentQ.tip}</p>
              )}
            </Card>

            <div ref={scrollRef} className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
              {qTurns.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "rounded-xl px-4 py-3 text-sm",
                    t.role === "candidate" || t.role === "followup"
                      ? "ml-8 bg-[var(--primary)]/15"
                      : "mr-4 border bg-[var(--panel-2)]"
                  )}
                  style={
                    t.role === "feedback" || t.role === "followup_reply"
                      ? { borderColor: "var(--border)" }
                      : undefined
                  }
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {t.role === "candidate"
                      ? "Your answer"
                      : t.role === "feedback"
                        ? "Coach feedback"
                        : t.role === "followup"
                          ? "Your follow-up"
                          : "Coach reply"}
                  </p>
                  {t.role === "feedback" || t.role === "followup_reply" ? (
                    <div className="prose-chat">
                      <ChatMarkdown content={t.content} />
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{t.content}</p>
                  )}
                </div>
              ))}

              {streaming && streamText && (
                <div
                  className="mr-4 rounded-xl border bg-[var(--panel-2)] px-4 py-3 text-sm"
                  style={{ borderColor: "var(--border)" }}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Coach
                  </p>
                  <div className="prose-chat">
                    <ChatMarkdown content={streamText} />
                    <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[var(--primary-2)]" />
                  </div>
                </div>
              )}
            </div>

            {!answered && !streaming && (
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-sm font-medium">Your answer</label>
                  {voice.isSupported && (
                    <div className="flex items-center gap-2">
                      {voice.state === "recording" && (
                        <>
                          <span className="text-xs text-red-400">
                            ● {voice.seconds}s
                          </span>
                          <div
                            className="h-2 w-16 overflow-hidden rounded-full bg-[var(--panel)]"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <div
                              className="h-full rounded-full bg-[var(--primary)] transition-all"
                              style={{ width: `${Math.round(voice.level * 100)}%` }}
                            />
                          </div>
                        </>
                      )}
                      <Button
                        variant={voice.state === "recording" ? "primary" : "outline"}
                        size="sm"
                        onClick={handleMicClick}
                        disabled={transcribing || voice.state === "processing"}
                      >
                        {transcribing || voice.state === "processing"
                          ? "Transcribing…"
                          : voice.state === "recording"
                            ? "Stop & transcribe"
                            : "🎤 Record answer"}
                      </Button>
                      {voice.state === "recording" && (
                        <Button variant="ghost" size="sm" onClick={() => void voice.cancelRecording()}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {(voice.error || transcribing) && voice.error && (
                  <p className="text-xs text-amber-300">{voice.error}</p>
                )}
                {deliveryMetrics && (
                  <div
                    className="rounded-lg border px-3 py-2 text-xs text-[var(--muted)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <p className="mb-1 font-medium text-[var(--text)]">Delivery signals</p>
                    <p>
                      {deliveryMetrics.words_per_minute} wpm · {deliveryMetrics.word_count} words ·{" "}
                      {deliveryMetrics.filler_count} fillers ({deliveryMetrics.filler_rate_per_100}/100)
                      {deliveryMetrics.pause_count > 0 &&
                        ` · ${deliveryMetrics.pause_count} pause(s)`}
                    </p>
                    {deliveryMetrics.observations.map((o) => (
                      <p key={o} className="mt-1 italic">
                        {o}
                      </p>
                    ))}
                    <p className="mt-1.5 text-[10px]">
                      Edit the transcript below before submitting.
                    </p>
                  </div>
                )}
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={onAnswerKeyDown}
                  rows={6}
                  placeholder="Type or record your answer. Use STAR for behavioral questions."
                  className="w-full resize-none rounded-lg border bg-[var(--panel-2)] px-3 py-2 text-sm leading-relaxed outline-none focus:border-[var(--primary)]"
                  style={{ borderColor: "var(--border)" }}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--muted)]">⌘/Ctrl + Enter to submit</p>
                  <Button
                    onClick={submitAnswer}
                    disabled={!answer.trim() || streaming || voice.state === "recording"}
                  >
                    Get feedback
                  </Button>
                </div>
              </Card>
            )}

            {answered && !streaming && (
              <Card className="space-y-3">
                <label className="block text-sm font-medium">
                  Ask a follow-up (clarify, drill deeper, request a model answer)
                </label>
                <textarea
                  value={followup}
                  onChange={(e) => setFollowup(e.target.value)}
                  rows={2}
                  placeholder="e.g. How could I quantify impact better on this story?"
                  className="w-full resize-none rounded-lg border bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                  style={{ borderColor: "var(--border)" }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={sendFollowup}
                    disabled={!followup.trim()}
                  >
                    Send follow-up
                  </Button>
                  {!isLast ? (
                    <Button onClick={goNext} disabled={busy}>
                      Next question →
                    </Button>
                  ) : (
                    <Button onClick={finishSession} disabled={busy}>
                      {busy ? "Summarizing…" : "Finish & get summary"}
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Progress
              </p>
              <ul className="space-y-1.5">
                {session.questions.map((q, i) => {
                  const done = hasFeedbackForQuestion(session.turns, i);
                  const current = i === session.current_index;
                  return (
                    <li
                      key={i}
                      className={cn(
                        "rounded-lg px-2 py-1.5 text-xs",
                        current && "bg-[var(--primary)]/10",
                        done && !current && "text-[var(--muted)]"
                      )}
                    >
                      {done ? "✓" : current ? "→" : "○"} Q{i + 1}:{" "}
                      {q.text.slice(0, 48)}…
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Button variant="ghost" size="sm" onClick={resetToSetup}>
              ← New session
            </Button>
          </div>
        </div>
      )}

      {phase === "summary" && session && (
        <div className="space-y-4">
          <Card>
            <div className="prose-chat">
              <ChatMarkdown content={summaryMarkdown(session.summary)} />
            </div>
          </Card>
          {session.recurring_weaknesses.length > 0 && (
            <Card>
              <p className="mb-2 text-sm font-medium">Recurring weaknesses to work on</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                {session.recurring_weaknesses.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Card>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={resetToSetup}>Start new session</Button>
            <Button variant="outline" href="/coach">
              Back to Coach
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
