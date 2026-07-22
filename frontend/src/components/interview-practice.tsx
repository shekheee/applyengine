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
import { PhaseStepper } from "@/components/interview/phase-stepper";
import { OptionGrid, SegmentControl } from "@/components/interview/option-grid";
import { QuestionCard, SessionMetaBadges } from "@/components/interview/question-card";
import { ConversationThread } from "@/components/interview/conversation-thread";
import { AnswerComposer, FollowupComposer } from "@/components/interview/answer-composer";
import { SessionRail } from "@/components/interview/session-rail";
import { SummaryView } from "@/components/interview/summary-view";
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

  function openSession(s: InterviewSession) {
    setSession(s);
    setPhase(s.status === "completed" ? "summary" : "practice");
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
        embedded ? "space-y-4" : "page-enter mx-auto max-w-6xl space-y-8 px-0 sm:px-1"
      )}
    >
      {!embedded && (
        <header className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary-2)]">
                Interview prep
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Interview Practice
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
                Tailored questions from your resume
                {jobId !== "" ? " and target role" : ""} with actionable feedback from your AI coach.
              </p>
            </div>
            {models.length > 0 && (
              <ModelSelector
                models={models}
                selectedId={selectedModel}
                onChange={setSelectedModel}
                disabled={busy || streaming}
              />
            )}
          </div>
          <PhaseStepper phase={phase} />
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
        <PhaseStepper phase={phase} compact />
      )}

      {!profile && <ProfileRequiredBanner />}

      {error && <AlertBanner tone="error">{error}</AlertBanner>}

      {(phase === "setup" || progress?.completed_sessions) && !embedded ? (
        <InterviewProgressPanel progress={progress} />
      ) : null}

      {phase === "setup" && (
        <div className={embedded ? "space-y-4" : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]"}>
          <Card
            className="space-y-8 border-[var(--border)] p-6 sm:p-8"
            gradient
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

            {curriculum && (
              <div
                className="rounded-[var(--radius-xl)] border bg-[var(--panel-2)]/40 p-5"
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

            <div className="border-t border-[var(--border)] pt-6">
              <Button
                onClick={startSession}
                disabled={!profile || busy}
                variant="gradient"
                size="lg"
                className="w-full sm:w-auto"
              >
                {busy
                  ? "Generating questions…"
                  : embedded
                    ? "Prepare for interview"
                    : "Start practice session"}
              </Button>
            </div>
          </Card>

          {!embedded && (
            <ContextSidebar
              profile={profile}
              pastSessions={pastSessions}
              onOpenSession={openSession}
            />
          )}
        </div>
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
