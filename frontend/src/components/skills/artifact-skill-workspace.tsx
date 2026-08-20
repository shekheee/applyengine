"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { CoachModel, Job, ReasoningEffort, SkillArtifact } from "@/lib/types";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { getStoredModelId, storeModelId } from "@/components/model-selector";
import { DocumentSkillIcon, PresentationSkillIcon } from "./skill-icons";

type SkillKind = "document" | "presentation";

const DOCUMENT_TEMPLATES = [
  ["cover-letter", "Cover letter"],
  ["executive-brief", "Executive brief"],
  ["interview-notes", "Interview notes"],
  ["proposal", "Professional proposal"],
] as const;

const PRESENTATION_TEMPLATES = [
  ["interview-deck", "Interview presentation"],
  ["case-study", "Case study"],
  ["30-60-90", "30 / 60 / 90-day plan"],
  ["personal-pitch", "Personal pitch"],
] as const;

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function DocumentPreview({ artifact }: { artifact: SkillArtifact }) {
  const content = artifact.content;
  return (
    <div className="mx-auto min-h-[760px] w-full max-w-[720px] bg-white px-[8%] py-[7%] text-slate-800 shadow-[0_24px_80px_rgba(0,0,0,.28)]" style={{ aspectRatio: "210 / 297" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-700">{artifact.template.replaceAll("-", " ")}</p>
      <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] text-slate-900">{content.title}</h2>
      {content.subtitle && <p className="mt-2 border-b border-slate-200 pb-5 text-sm leading-6 text-slate-500">{content.subtitle}</p>}
      <div className="mt-6 space-y-5">
        {(content.sections ?? []).map((section, index) => (
          <section key={`${section.heading}-${index}`}>
            {section.heading && <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-teal-800">{section.heading}</h3>}
            <div className="space-y-2 text-[12px] leading-[1.65]">
              {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
              {section.bullets.length > 0 && <ul className="space-y-1 pl-4">{section.bullets.map((bullet, bulletIndex) => <li className="list-disc" key={bulletIndex}>{bullet}</li>)}</ul>}
            </div>
          </section>
        ))}
      </div>
      {content.closing && <p className="mt-6 whitespace-pre-line text-[12px] leading-[1.65]">{content.closing}</p>}
    </div>
  );
}

function PresentationPreview({ artifact }: { artifact: SkillArtifact }) {
  const slides = artifact.content.slides ?? [];
  const [selected, setSelected] = useState(0);
  const isTitle = selected === 0;
  const slide = slides[selected - 1];
  useEffect(() => {
    // A newly generated deck always opens on its title slide.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(0);
  }, [artifact.id]);
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[110px_1fr]">
      <div className="order-2 flex gap-2 overflow-x-auto xl:order-1 xl:block xl:space-y-2 xl:overflow-visible">
        {[null, ...slides].map((item, index) => (
          <button key={index} type="button" onClick={() => setSelected(index)} className={`relative aspect-video w-24 shrink-0 overflow-hidden rounded border text-left transition ${selected === index ? "ring-2 ring-[var(--primary)]" : "opacity-65 hover:opacity-100"}`} style={{ borderColor: "var(--border)", background: index === 0 ? "#102034" : "#f7f9fa" }}>
            <span className={`absolute inset-2 line-clamp-3 text-[7px] font-semibold leading-tight ${index === 0 ? "text-white" : "text-slate-700"}`}>{index === 0 ? artifact.content.title : item?.title}</span>
            <span className="absolute bottom-1 right-1 text-[6px] text-slate-400">{index + 1}</span>
          </button>
        ))}
      </div>
      <div className="order-1 flex aspect-video min-w-0 flex-col overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,.28)] xl:order-2" style={{ background: isTitle ? "#102034" : "#f7f9fa", color: isTitle ? "white" : "#1f2a37" }}>
        {isTitle ? (
          <div className="flex h-full border-l-[10px] border-teal-600 px-[8%] py-[9%]">
            <div className="my-auto max-w-[85%]"><p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-teal-300">ApplyEngine · Skills</p><h2 className="mt-5 text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{artifact.content.title}</h2><p className="mt-4 text-xs leading-6 text-slate-300 sm:text-sm">{artifact.content.subtitle || "Professional presentation"}</p></div>
          </div>
        ) : slide ? (
          <div className="flex h-full border-l-[10px] border-teal-600 px-[7%] py-[6%]">
            <div className="w-full"><p className="text-[8px] font-semibold uppercase tracking-[0.2em] text-teal-700 sm:text-[10px]">{slide.kicker || `${selected}`}</p><h2 className="mt-2 text-xl font-semibold leading-tight tracking-[-0.02em] text-slate-900 sm:text-3xl">{slide.title}</h2>{slide.body && <p className="mt-4 max-w-[90%] text-[10px] leading-5 text-slate-500 sm:text-sm sm:leading-6">{slide.body}</p>}{slide.bullets.length > 0 && <ul className="mt-5 space-y-2 text-[10px] leading-4 sm:text-sm sm:leading-6">{slide.bullets.map((bullet, index) => <li key={index} className="flex gap-3"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600"/><span>{bullet}</span></li>)}</ul>}</div>
          </div>
        ) : null}
      </div>
      {!isTitle && slide?.speaker_notes && <div className="order-3 rounded-lg border bg-[var(--panel)] p-3 text-xs leading-5 text-[var(--muted)] xl:col-start-2"><span className="font-semibold text-[var(--text-secondary)]">Speaker notes · </span>{slide.speaker_notes}</div>}
    </div>
  );
}

export function ArtifactSkillWorkspace({ kind }: { kind: SkillKind }) {
  const skillId = kind === "document" ? "document-writer" : "presentation-builder";
  const templates = kind === "document" ? DOCUMENT_TEMPLATES : PRESENTATION_TEMPLATES;
  const Icon = kind === "document" ? DocumentSkillIcon : PresentationSkillIcon;
  const [artifacts, setArtifacts] = useState<SkillArtifact[]>([]);
  const [active, setActive] = useState<SkillArtifact | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [models, setModels] = useState<CoachModel[]>([]);
  const [template, setTemplate] = useState<string>(templates[0][0]);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [jobId, setJobId] = useState<number | "">("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState<ReasoningEffort>("high");
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState<"generate" | "revise" | "download" | "">("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.listSkillArtifacts(skillId), api.listJobs().catch(() => []), api.listCoachModels()])
      .then(([history, jobList, modelData]) => {
        setArtifacts(history); setActive(history[0] ?? null); setJobs(jobList); setModels(modelData.models);
        const stored = getStoredModelId();
        setModel(stored && modelData.models.some((item) => item.id === stored) ? stored : modelData.default_model);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load this skill."));
  }, [skillId]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === jobId), [jobs, jobId]);

  async function generate() {
    if (!brief.trim()) { setError("Describe the artifact you want to create."); return; }
    setBusy("generate"); setError("");
    try {
      const artifact = await api.createSkillArtifact({ skill_id: skillId, template, title: title.trim(), brief: brief.trim(), job_id: jobId || null, model: model || undefined, reasoning_effort: effort });
      setArtifacts((previous) => [artifact, ...previous]); setActive(artifact);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Generation failed."); }
    finally { setBusy(""); }
  }

  async function revise() {
    if (!active || !revision.trim()) return;
    setBusy("revise"); setError("");
    try {
      const artifact = await api.reviseSkillArtifact(active.id, { instruction: revision.trim(), model: model || undefined, reasoning_effort: effort });
      setArtifacts((previous) => [artifact, ...previous]); setActive(artifact); setRevision("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revision failed."); }
    finally { setBusy(""); }
  }

  async function download(format: "docx" | "pdf" | "pptx") {
    if (!active) return;
    setBusy("download"); setError("");
    try { const result = await api.downloadSkillArtifact(active.id, format); saveBlob(result.blob, result.filename); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Download failed."); }
    finally { setBusy(""); }
  }

  return (
    <div className="mx-auto max-w-[1500px] pb-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5 border-b pb-6" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-start gap-4"><div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--panel-2)] text-[var(--primary-2)]"><Icon className="h-6 w-6" /></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">ApplyEngine skill</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{kind === "document" ? "Document Writer" : "Presentation Builder"}</h1><p className="mt-1 text-sm text-[var(--muted)]">Uses your verified resume{selectedJob ? ` and ${selectedJob.title} at ${selectedJob.company}` : " and optional target job"}.</p></div></div>
        <Button href="/skills" variant="outline" size="sm">All skills</Button>
      </header>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[290px_minmax(0,1fr)_240px]">
        <aside className="h-fit space-y-4 rounded-xl border bg-[var(--panel)] p-4" style={{ borderColor: "var(--border)" }}>
          <div><Label htmlFor="skill-template">Format</Label><Select id="skill-template" value={template} onChange={(event) => setTemplate(event.target.value)}>{templates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
          <div><Label htmlFor="skill-title">Working title</Label><Input id="skill-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Let the skill choose, or add one" /></div>
          <div><Label htmlFor="skill-job">Target job</Label><Select id="skill-job" value={jobId} onChange={(event) => setJobId(event.target.value ? Number(event.target.value) : "")}><option value="">No specific job</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.company}</option>)}</Select></div>
          <div><Label htmlFor="skill-brief">What should it accomplish?</Label><Textarea value={brief} onChange={setBrief} rows={8} placeholder={kind === "document" ? "Audience, purpose, key points and tone…" : "Audience, interview task, required story and key evidence…"} /></div>
          <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="skill-model">Model</Label><Select id="skill-model" value={model} onChange={(event) => { setModel(event.target.value); storeModelId(event.target.value); }}>{models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></div><div><Label htmlFor="skill-effort">Thinking</Label><Select id="skill-effort" value={effort} onChange={(event) => setEffort(event.target.value as ReasoningEffort)}><option value="medium">Medium</option><option value="high">Hard</option><option value="xhigh">Very hard</option></Select></div></div>
          <Button className="w-full" variant="gradient" disabled={Boolean(busy) || !brief.trim()} onClick={generate}>{busy === "generate" ? "Creating…" : `Create ${kind}`}</Button>
          <p className="text-[10px] leading-4 text-[var(--muted-2)]">Claims are grounded in your inputs. Review every artifact before sending or presenting.</p>
        </aside>

        <section className="min-w-0" aria-label={`${kind} preview and revisions`}>
          {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
          {active ? <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-[var(--text)]">{active.title}</h2><p className="mt-0.5 text-[10px] text-[var(--muted)]">{active.provider_served && active.model_served ? `${active.provider_served} · ${active.model_served}` : "Structured fallback draft"} · {new Date(active.created_at).toLocaleString()}</p></div><div className="flex gap-2">{kind === "document" ? <><Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => download("docx")}>Word</Button><Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => download("pdf")}>PDF</Button></> : <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => download("pptx")}>PowerPoint</Button>}</div></div>
            <div className="overflow-auto rounded-xl border bg-[var(--bg)] p-3 sm:p-6" style={{ borderColor: "var(--border)" }}>{kind === "document" ? <DocumentPreview artifact={active} /> : <PresentationPreview artifact={active} />}</div>
            <div className="mt-4 rounded-xl border bg-[var(--panel)] p-3" style={{ borderColor: "var(--border)" }}><Label htmlFor="skill-revision">Ask this skill to revise the current version</Label><div className="flex flex-col gap-2 sm:flex-row"><Input id="skill-revision" value={revision} onChange={(event) => setRevision(event.target.value)} placeholder="Make the opening sharper, add more evidence, reduce to six slides…"/><Button variant="outline" disabled={!revision.trim() || Boolean(busy)} onClick={revise}>{busy === "revise" ? "Revising…" : "Revise"}</Button></div></div>
          </> : <div className="flex min-h-[540px] items-center justify-center rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--border)" }}><div><Icon className="mx-auto h-10 w-10 text-[var(--muted)]"/><h2 className="mt-4 text-lg font-semibold">Create your first {kind}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">Choose a format, optionally anchor it to a job, then describe the outcome. Your editable preview will appear here.</p></div></div>}
        </section>

        <aside className="h-fit rounded-xl border bg-[var(--panel)]" style={{ borderColor: "var(--border)" }}><div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Version history</h2></div><div className="max-h-[650px] divide-y overflow-y-auto" style={{ borderColor: "var(--border)" }}>{artifacts.length ? artifacts.map((artifact) => <button key={artifact.id} type="button" onClick={() => setActive(artifact)} className={`block w-full px-4 py-3 text-left transition-colors hover:bg-[var(--panel-2)] ${active?.id === artifact.id ? "bg-[var(--panel-2)]" : ""}`}><p className="line-clamp-2 text-xs font-medium leading-5 text-[var(--text-secondary)]">{artifact.title}</p><div className="mt-1 flex items-center justify-between gap-2 text-[9px] uppercase tracking-wider text-[var(--muted-2)]"><span>{artifact.parent_id ? "Revision" : artifact.template.replaceAll("-", " ")}</span><span>{new Date(artifact.created_at).toLocaleDateString()}</span></div></button>) : <p className="px-4 py-8 text-center text-xs leading-5 text-[var(--muted)]">Generated versions will be saved here.</p>}</div></aside>
      </div>
    </div>
  );
}
