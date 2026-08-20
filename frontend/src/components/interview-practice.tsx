"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
import { Button, Card, cn } from "@/components/ui";
import { InterviewCurriculumPanel } from "@/components/interview-curriculum";
import { InterviewProgressPanel } from "@/components/interview-progress";
import { ModelSelector, getStoredModelId, storeModelId } from "@/components/model-selector";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import type { RecordedAudio } from "@/hooks/use-voice-recorder";
import { mergeDeliveryAnalysis } from "@/lib/audio";
import { PhaseStepper } from "@/components/interview/phase-stepper";
import { OptionGrid, SegmentControl } from "@/components/interview/option-grid";
import { QuestionCard, SessionMetaBadges } from "@/components/interview/question-card";
import { ConversationThread } from "@/components/interview/conversation-thread";
import { AnswerComposer, FollowupComposer } from "@/components/interview/answer-composer";
import { SessionRail } from "@/components/interview/session-rail";
import { SummaryView } from "@/components/interview/summary-view";
import { LiveInterviewRoom } from "@/components/interview/live-interview-room";
import {
  AlertBanner,
  InterviewLoadingState,
  ProfileRequiredBanner,
} from "@/components/interview/alert-banner";
import {
  ContextSidebar,
  JobContextNote,
  JobSelector,
} from "@/components/interview/context-sidebar";
import { IconArrowRight } from "@/components/interview/icons";

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
  const [phase, setPhase] = useState<"setup" | "practice" | "live" | "summary">("setup");
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
  const [behaviorMode, setBehaviorMode] = useState<"simulation" | "coach">("simulation");
  const [interviewerPersona, setInterviewerPersona] = useState("hiring_manager");
  const [captionMode, setCaptionMode] = useState<"progressive" | "hidden">("progressive");
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
  const audioAnalysisVersionRef = useRef(0);

  const voice = useVoiceRecorder(processRecordedAudio);
  const abortRef = useRef<AbortController | null>(null);
  const answerRequestRef = useRef<{ fingerprint: string; id: string } | null>(null);
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
          api.listJobs().catch(() => []),
          api.listCoachModels().catch(() => ({ models: [], default_model: "" })),
          api.listInterviewSessions().catch(() => []),
          api.getInterviewProgress().catch(() => null),
          api.getInterviewCurriculum().catch(() => null),
        ]);
        setProfile(base);
        setJobs(jobList ?? []);
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

  async function startSession(mode: "text" | "live" = "text") {
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
        mode,
        behavior_mode: behaviorMode,
        interviewer_persona: interviewerPersona,
        captions: captionMode,
      });
      setSession(s);
      setAnswer("");
      setFollowup("");
      setLiveFeedback("");
      setDeliveryMetrics(null);
      setPhase(mode === "live" ? "live" : "practice");
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
    const submittedAnswer = answer.trim();
    const fingerprint = `${session.id}:${session.current_index}:${submittedAnswer}`;
    const requestId =
      answerRequestRef.current?.fingerprint === fingerprint
        ? answerRequestRef.current.id
        : crypto.randomUUID();
    answerRequestRef.current = { fingerprint, id: requestId };

    try {
      const { turn } = await api.submitInterviewAnswerStream(
        session.id,
        submittedAnswer,
        (token) => {
          setStreamText((prev) => prev + token);
          setLiveFeedback((prev) => prev + token);
        },
        {
          question_index: session.current_index,
          model: selectedModel || undefined,
          signal: abortRef.current.signal,
          request_id: requestId,
          delivery: deliveryMetrics ?? undefined,
        }
      );
      const updated = await api.getInterviewSession(session.id);
      setSession(updated);
      setAnswer("");
      setDeliveryMetrics(null);
      setLiveFeedback(turn.content);
      setStreamText("");
      answerRequestRef.current = null;
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

  async function openSession(s: InterviewSession) {
    setError("");
    let detailed = s;
    try {
      detailed = await api.getInterviewSession(s.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this session.");
      return;
    }
    setSession(detailed);
    if (detailed.status === "completed") {
      setPhase("summary");
    } else if (detailed.mode === "live") {
      setPhase("live");
    } else {
      setPhase("practice");
    }
  }

  async function renameSession(s: InterviewSession) {
    const title = window.prompt("Session name", s.title || "Interview practice");
    if (title == null || !title.trim()) return;
    try {
      const updated = await api.updateInterviewSession(s.id, { title: title.trim() });
      setPastSessions((items) => items.map((item) => (item.id === s.id ? updated : item)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename session.");
    }
  }

  async function archiveSession(s: InterviewSession) {
    try {
      await api.updateInterviewSession(s.id, { archived: true });
      setPastSessions((items) => items.filter((item) => item.id !== s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not archive session.");
    }
  }

  async function deleteSession(s: InterviewSession) {
    if (!window.confirm(`Delete “${s.title || "this interview"}” and its transcript?`)) return;
    try {
      await api.deleteInterviewSession(s.id);
      setPastSessions((items) => items.filter((item) => item.id !== s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete session.");
    }
  }

  async function processRecordedAudio(recorded: RecordedAudio | null) {
    setTranscribing(true);
    voice.setError(null);
    try {
      if (!recorded || recorded.blob.size < 100) {
        voice.setError("Recording too short. Try again.");
        return;
      }
      const result = await api.transcribeInterviewAudio(
        recorded.blob,
        recorded.mime,
        recorded.duration,
        recorded.metrics
      );
      setAnswer(result.text);
      setDeliveryMetrics(result.delivery);
      const analysisVersion = audioAnalysisVersionRef.current + 1;
      audioAnalysisVersionRef.current = analysisVersion;
      void api
        .analyzeInterviewAudio(
          recorded.blob,
          recorded.mime,
          recorded.duration,
          result.text,
          recorded.metrics
        )
        .then((analysis) => {
          if (audioAnalysisVersionRef.current !== analysisVersion) return;
          setDeliveryMetrics((current) =>
            current ? mergeDeliveryAnalysis(current, analysis) : current
          );
        })
        .catch(() => undefined);
    } catch (e) {
      voice.setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setTranscribing(false);
    }
  }

  async function handleMicClick() {
    if (voice.state === "recording") {
      await processRecordedAudio(await voice.finishRecording());
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
    return <InterviewLoadingState embedded={embedded} />;
  }

  const currentQ = session?.questions[session.current_index];
  const totalQ = session?.questions.length ?? 0;
  const qTurns = session ? turnsForQuestion(session.turns, session.current_index) : [];
  const answered = session
    ? hasFeedbackForQuestion(session.turns, session.current_index)
    : false;
  const isLast =
    session != null && session.current_index >= (session.questions.length - 1);

  const categoryLabel = session?.curriculum_topic
    ? curriculumTopicLabel(currentQ?.category ?? "")
    : (currentQ?.category ?? "");

  return (
    <div
      className={cn(
        "min-w-0",
        embedded ? "space-y-4" : "page-shell page-enter mx-auto max-w-[1480px] space-y-6 px-0 sm:px-1"
      )}
    >
      {!embedded && (
        <header className="space-y-5 border-b border-[var(--border)] pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow">
                Interview prep
              </p>
              <h1 className="page-title mt-1">
                Interview Practice
              </h1>
              <p className="page-description mt-2">
                Tailored questions from your resume
                {jobId !== "" ? " and target role" : ""} with actionable feedback from your AI coach.
              </p>
            </div>
          </div>
          <PhaseStepper phase={phase === "live" ? "practice" : phase} liveMode={phase === "live"} />
        </header>
      )}

      {embedded && phase === "setup" && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">Prepare for interview</h2>
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
              Full practice
              <IconArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {embedded && phase !== "setup" && (
        <PhaseStepper phase={phase === "live" ? "practice" : phase} compact liveMode={phase === "live"} />
      )}

      {!profile && <ProfileRequiredBanner />}

      {error && <AlertBanner tone="error">{error}</AlertBanner>}

      {phase === "setup" && (
        <div className={embedded ? "space-y-4" : "grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"}>
          <Card
            className="workspace-panel space-y-7 p-5 sm:p-7"
          >
            <OptionGrid
              label="Focus area"
              hint="Choose the type of questions you want to practice"
              options={INTERVIEW_FOCUS.map((f) => ({
                id: f.id,
                label: f.label,
                desc: f.desc,
              }))}
              value={focus}
              onChange={setFocus}
            />

            <SegmentControl
              label="Difficulty"
              options={INTERVIEW_DIFFICULTY.map((d) => ({ id: d.id, label: d.label }))}
              value={difficulty}
              onChange={setDifficulty}
            />

            {models.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
                <div>
                  <p className="text-sm font-medium text-[var(--text-secondary)]">Interview model</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">Fallback is automatic if this provider is unavailable.</p>
                </div>
                <ModelSelector
                  models={models}
                  selectedId={selectedModel}
                  onChange={setSelectedModel}
                  disabled={busy || streaming}
                />
              </div>
            )}

            <div className="space-y-5 border-y border-[var(--border)] py-6">
              <SegmentControl
                label="Live interview behaviour"
                options={[
                  { id: "simulation", label: "Simulation" },
                  { id: "coach", label: "Coach" },
                ]}
                value={behaviorMode}
                onChange={(value) => setBehaviorMode(value as "simulation" | "coach")}
              />
              <OptionGrid
                label="Interviewer persona"
                hint="Changes the interviewer’s priorities and challenge style"
                options={[
                  { id: "hiring_manager", label: "Hiring manager", desc: "Balanced ownership, judgement and impact" },
                  { id: "recruiter", label: "Recruiter screen", desc: "Motivation, fit and career narrative" },
                  { id: "technical_panel", label: "Technical panel", desc: "Depth, trade-offs and failure modes" },
                  { id: "skeptical_stakeholder", label: "Senior stakeholder", desc: "Pushback, influence and risk" },
                  { id: "change_leader", label: "Change leader", desc: "Adoption, sponsorship and resistance" },
                ]}
                value={interviewerPersona}
                onChange={setInterviewerPersona}
              />
              <SegmentControl
                label="Spoken-question captions"
                options={[
                  { id: "progressive", label: "Show progressively" },
                  { id: "hidden", label: "Audio only" },
                ]}
                value={captionMode}
                onChange={(value) => setCaptionMode(value as "progressive" | "hidden")}
              />
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                {behaviorMode === "simulation"
                  ? "Simulation withholds coaching and scores until the interview ends."
                  : "Coach mode gives one brief actionable observation between questions."}
              </p>
            </div>

            {curriculum && (
              <div
                className="border-l-2 bg-[var(--panel-2)]/40 p-5"
                style={{ borderColor: "var(--border)" }}
              >
                {!showMlTrack && !curriculum.ml_profile_detected ? (
                  <button
                    type="button"
                    onClick={() => setShowMlTrack(true)}
                    className="text-sm font-medium text-[var(--primary-2)] transition-colors hover:text-[var(--primary)] motion-reduce:transition-none"
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
                        className="mb-3 text-xs text-[var(--muted)] hover:text-[var(--text)]"
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
              <JobSelector jobs={jobs} jobId={jobId} onChange={setJobId} />
            ) : (
              <JobContextNote />
            )}

            <div className="border-t border-[var(--border)] pt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void startSession("live")}
                  disabled={!profile || busy}
                  className="group rounded-xl border border-[var(--primary)]/50 bg-[color-mix(in_srgb,var(--primary)_8%,var(--panel))] p-5 text-left transition-colors hover:border-[var(--primary)] disabled:opacity-50 motion-reduce:transition-none"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary-2)]">
                    Recommended
                  </p>
                  <p className="mt-2 text-base font-semibold text-[var(--text)]">
                    Start live interview
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                    AI interviewer speaks aloud, listens to your answers, and follows up in real time.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void startSession("text")}
                  disabled={!profile || busy}
                  className="rounded-xl border p-5 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--panel-2)] disabled:opacity-50 motion-reduce:transition-none"
                  style={{ borderColor: "var(--border)" }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Text practice
                  </p>
                  <p className="mt-2 text-base font-semibold text-[var(--text)]">
                    Turn-based practice
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                    Read questions, type or dictate answers, and get detailed written feedback.
                  </p>
                </button>
              </div>
              {busy && (
                <p className="text-sm text-[var(--muted)]">
                  {curriculumTopic ? "Preparing your interview room…" : "Generating questions…"}
                </p>
              )}
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                Your selected AI model receives the resume/JD context needed for coaching. Voice answers are transcribed by the configured speech provider; transcripts and delivery measurements remain in your session until you delete it.
              </p>
            </div>
          </Card>

          {!embedded && (
            <ContextSidebar
              profile={profile}
              pastSessions={pastSessions}
              onOpenSession={(item) => void openSession(item)}
              onRenameSession={(item) => void renameSession(item)}
              onArchiveSession={(item) => void archiveSession(item)}
              onDeleteSession={(item) => void deleteSession(item)}
            />
          )}
        </div>
      )}

      {phase === "setup" && !embedded && Boolean(progress?.completed_sessions) && (
        <details className="workspace-panel group overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-[var(--text-secondary)] sm:px-6">
            View interview progress
            <span className="text-xs font-normal text-[var(--muted)] group-open:hidden">Show scores and history</span>
            <span className="hidden text-xs font-normal text-[var(--muted)] group-open:inline">Hide progress</span>
          </summary>
          <div className="border-t border-[var(--border)] p-4 sm:p-5">
            <InterviewProgressPanel progress={progress} />
          </div>
        </details>
      )}

      {phase === "live" && session && (
        <LiveInterviewRoom
          session={session}
          selectedModel={selectedModel}
          companyLabel={
            session.job_id
              ? (jobs.find((j) => j.id === session.job_id)?.company ?? "Target role")
              : undefined
          }
          embedded={embedded}
          onSessionUpdate={setSession}
          onComplete={async (completed) => {
            setSession(completed);
            setPhase("summary");
            const sessions = await api.listInterviewSessions();
            setPastSessions(sessions);
            const prog = await api.getInterviewProgress().catch(() => null);
            setProgress(prog);
          }}
          onExit={resetToSetup}
        />
      )}

      {phase === "practice" && session && currentQ && (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-4">
            <SessionMetaBadges
              difficulty={session.difficulty}
              company={
                session.job_id
                  ? (jobs.find((j) => j.id === session.job_id)?.company ?? "Target role")
                  : undefined
              }
            />

            <QuestionCard
              index={session.current_index}
              total={totalQ}
              text={currentQ.text}
              category={categoryLabel}
              tip={currentQ.tip}
              trackLabel={
                session.curriculum_topic
                  ? `${curriculumTopicLabel(session.curriculum_topic)} track`
                  : undefined
              }
            />

            <ConversationThread
              turns={qTurns}
              streamingText={streaming ? streamText : undefined}
              scrollRef={scrollRef}
            />

            {!answered && !streaming && (
              <AnswerComposer
                answer={answer}
                onAnswerChange={setAnswer}
                onSubmit={submitAnswer}
                onKeyDown={onAnswerKeyDown}
                streaming={streaming}
                voice={voice}
                transcribing={transcribing}
                deliveryMetrics={deliveryMetrics}
                onMicClick={handleMicClick}
                onCancelRecording={() => void voice.cancelRecording()}
              />
            )}

            {answered && !streaming && (
              <FollowupComposer
                followup={followup}
                onFollowupChange={setFollowup}
                onSend={sendFollowup}
                onNext={goNext}
                onFinish={finishSession}
                isLast={isLast}
                busy={busy}
                streaming={streaming}
              />
            )}
          </div>

          <SessionRail
            questions={session.questions}
            turns={session.turns}
            currentIndex={session.current_index}
            onReset={resetToSetup}
          />
        </div>
      )}

      {phase === "summary" && session && (
        <SummaryView session={session} onReset={resetToSetup} />
      )}
    </div>
  );
}
