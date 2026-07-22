"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { type Application, type Job, type Status } from "@/lib/types";
import { Button } from "@/components/ui";
import { AppIcon } from "@/components/app-icon";
import { CoachChat } from "@/components/coach-chat";
import { ResumeWorkspace } from "@/components/resume-workspace";
import { InterviewPractice } from "@/components/interview-practice";
import {
  ApplicationError,
  ApplicationHero,
  ApplicationLoading,
  ApplicationNotes,
  FitSnapshot,
  HubTabNav,
  HubTabPanel,
  MaterialsPanel,
  type HubTabId,
} from "@/components/application";

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [app, setApp] = useState<Application | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<HubTabId>("chat");
  const [genBusy, setGenBusy] = useState(false);
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

  if (error) return <ApplicationError message={error} />;
  if (!app || !job) return <ApplicationLoading />;

  const jobLabel = `${job.title} @ ${job.company}`;

  return (
    <div className="page-enter mx-auto max-w-6xl space-y-8 pb-8">
      <ApplicationHero job={job} app={app} onStatusChange={changeStatus} />

      <FitSnapshot app={app} />

      <section aria-label="Application workspace" className="space-y-0">
        <HubTabNav
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

        <div className="mt-6">
          <HubTabPanel
            tabId="chat"
            activeTab={tab}
            title="Role-scoped Coach"
            description={
              <>
                Same conversation appears in{" "}
                <Link
                  href="/coach"
                  className="text-[var(--primary-2)] underline-offset-2 hover:underline"
                >
                  Coach
                </Link>{" "}
                sidebar
              </>
            }
            flush
          >
            <div className="p-4 sm:p-6">
              <CoachChat embedded applicationId={app.id} />
            </div>
          </HubTabPanel>

          <HubTabPanel tabId="resume" activeTab={tab}>
            <ResumeWorkspace
              variant="application"
              lockedJobId={job.id}
              lockedJobLabel={jobLabel}
            />
          </HubTabPanel>

          <HubTabPanel tabId="interview" activeTab={tab}>
            <InterviewPractice
              embedded
              initialJobId={job.id}
              jobLabel={jobLabel}
            />
          </HubTabPanel>

          <HubTabPanel
            tabId="materials"
            activeTab={tab}
            title="Application materials"
            description="ATS-tailored text exports for this role"
            headerExtra={
              <Button onClick={generateAll} disabled={genBusy} size="sm">
                {genBusy ? "Generating…" : "Generate all"}
              </Button>
            }
          >
            <MaterialsPanel app={app} onGenerate={generateAll} genBusy={genBusy} />
          </HubTabPanel>
        </div>
      </section>

      <ApplicationNotes notes={notes} onChange={setNotes} onSave={saveNotes} />
    </div>
  );
}
