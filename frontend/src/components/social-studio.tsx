"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type {
  CoachModel,
  Profile,
  SocialMessage,
  SocialPlatform,
  SocialProject,
  SocialPublishingStatus,
} from "@/lib/types";
import { Badge, Button, Card, Input, Label, PageHeader, Select, TabBar, cn } from "@/components/ui";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ModelSelector, getStoredModelId, storeModelId } from "@/components/model-selector";

const LINKEDIN_PRESETS = [
  ["thought-leadership", "Thought leadership"],
  ["project-story", "Project story"],
  ["career-lesson", "Career lesson"],
  ["technical-explainer", "Technical explainer"],
  ["job-search", "Job-search positioning"],
] as const;

const MEDIUM_PRESETS = [
  ["deep-dive", "Technical deep dive"],
  ["case-study", "Case study"],
  ["tutorial", "Tutorial"],
  ["career-article", "Career article"],
] as const;

const STARTERS: Record<SocialPlatform, string[]> = {
  linkedin: [
    "Turn my strongest relevant experience into a LinkedIn post.",
    "Give me five resume-grounded post ideas.",
    "Create a carousel outline from one verified project.",
    "Write a thoughtful comment I could adapt for my field.",
  ],
  medium: [
    "Create an outline first using only themes supported by my resume.",
    "Draft a full publication-ready article in Markdown.",
    "Turn one verified project into a case study without inventing metrics.",
    "Write a technical tutorial and clearly separate experience from general guidance.",
  ],
};

type Settings = {
  preset: string;
  topic: string;
  audience: string;
  goal: string;
  tone: string;
  format: string;
  extra_context: string;
  soft_target: string;
};

const DEFAULT_SETTINGS: Record<SocialPlatform, Settings> = {
  linkedin: {
    preset: "thought-leadership",
    topic: "",
    audience: "Peers and hiring teams",
    goal: "Share useful insight and start a conversation",
    tone: "Clear, human, and confident",
    format: "LinkedIn post",
    extra_context: "",
    soft_target: "3000",
  },
  medium: {
    preset: "deep-dive",
    topic: "",
    audience: "Practitioners in my field",
    goal: "Teach something useful",
    tone: "Practical and authoritative",
    format: "Full article",
    extra_context: "",
    soft_target: "",
  },
};

function projectSettings(project: SocialProject | null, platform: SocialPlatform): Settings {
  return { ...DEFAULT_SETTINGS[platform], ...(project?.settings || {}) } as Settings;
}

function titleFor(platform: SocialPlatform, topic: string) {
  if (topic.trim()) return topic.trim().slice(0, 120);
  return platform === "linkedin" ? "New LinkedIn draft" : "New Medium article";
}

export function SocialStudio() {
  const [platform, setPlatform] = useState<SocialPlatform>("linkedin");
  const [projects, setProjects] = useState<SocialProject[]>([]);
  const [active, setActive] = useState<SocialProject | null>(null);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS.linkedin);
  const [input, setInput] = useState("");
  const [streamText, setStreamText] = useState("");
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<CoachModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [publishing, setPublishing] = useState<SocialPublishingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const optimisticIdRef = useRef(-1);

  const platformProjects = useMemo(
    () => projects.filter((item) => item.platform === platform),
    [projects, platform]
  );
  const presets = platform === "linkedin" ? LINKEDIN_PRESETS : MEDIUM_PRESETS;
  const softTarget = Number(settings.soft_target) || 3000;
  const overSoftTarget = platform === "linkedin" && draft.length > softTarget;

  const selectProject = useCallback(async (project: SocialProject) => {
    setActive(project);
    setSettings(projectSettings(project, project.platform));
    setDraft(project.current_content || "");
    setError("");
    try {
      setMessages(await api.listSocialMessages(project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this project.");
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [projectList, modelData, publishingData] = await Promise.all([
          api.listSocialProjects(),
          api.listCoachModels(),
          api.socialPublishingStatus(),
        ]);
        setProjects(projectList);
        setModels(modelData.models);
        setPublishing(publishingData);
        const stored = getStoredModelId();
        const model =
          stored && modelData.models.some((item) => item.id === stored)
            ? stored
            : modelData.default_model;
        setSelectedModel(model);
        if (model) storeModelId(model);
        try {
          setProfile(await api.baseProfile());
        } catch {
          setProfile(null);
        }
        const first = projectList.find((item) => item.platform === "linkedin");
        if (first) await selectProject(first);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load Social Studio.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [selectProject]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamText]);

  function changePlatform(next: SocialPlatform) {
    setPlatform(next);
    const nextProject = projects.find((item) => item.platform === next) || null;
    setActive(nextProject);
    setMessages([]);
    setDraft(nextProject?.current_content || "");
    setSettings(projectSettings(nextProject, next));
    setError("");
    if (nextProject) void selectProject(nextProject);
  }

  async function createProject() {
    setBusy(true);
    setError("");
    try {
      const created = await api.createSocialProject({
        platform,
        title: titleFor(platform, settings.topic),
        settings,
      });
      setProjects((prev) => [created, ...prev]);
      setActive(created);
      setMessages([]);
      setDraft("");
      setNotice("Draft workspace created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a project.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject() {
    if (!active || !confirm(`Delete “${active.title}” and its conversation?`)) return;
    setBusy(true);
    try {
      await api.deleteSocialProject(active.id);
      const next = projects.filter((item) => item.id !== active.id);
      setProjects(next);
      const fallback = next.find((item) => item.platform === platform) || null;
      setActive(fallback);
      setMessages([]);
      setDraft(fallback?.current_content || "");
      if (fallback) await selectProject(fallback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the project.");
    } finally {
      setBusy(false);
    }
  }

  function directionBlock() {
    return [
      `Preset: ${settings.preset}`,
      `Topic: ${settings.topic || "Choose the strongest resume-supported angle"}`,
      `Audience: ${settings.audience}`,
      `Goal: ${settings.goal}`,
      `Tone: ${settings.tone}`,
      `Format: ${settings.format}`,
      settings.extra_context ? `Optional user context: ${settings.extra_context}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function send(textOverride?: string) {
    if (!active || busy) {
      if (!active) setError("Create or select a draft workspace first.");
      return;
    }
    const text = (textOverride ?? input).trim();
    if (!text) return;
    if (!profile) {
      setError("Upload a base resume first. Social Studio will not generate ungrounded claims.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setInput("");
    setStreamText("");
    const optimistic: SocialMessage = {
      id: optimisticIdRef.current--,
      project_id: active.id,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const savedProject = await api.updateSocialProject(active.id, {
        title: titleFor(platform, settings.topic),
        settings,
      });
      const request = `${text}\n\nCreative direction (not verified biography):\n${directionBlock()}`;
      const result = await api.sendSocialMessageStream(
        active.id,
        request,
        (token) => setStreamText((prev) => prev + token),
        controller.signal,
        selectedModel || undefined
      );
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== optimistic.id),
        { ...result.user_message, content: text },
        result.assistant_message,
      ]);
      setActive({ ...result.project, settings: savedProject.settings });
      setDraft(result.project.current_content);
      setProjects((prev) =>
        prev.map((item) =>
          item.id === result.project.id
            ? { ...result.project, settings: savedProject.settings }
            : item
        )
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Draft generation failed.");
      }
      setMessages((prev) => prev.filter((item) => item.id !== optimistic.id));
      setInput(text);
    } finally {
      setBusy(false);
      setStreamText("");
      abortRef.current = null;
    }
  }

  async function saveDraft() {
    if (!active) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateSocialProject(active.id, {
        current_content: draft,
        settings,
      });
      setActive(updated);
      setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setNotice("Draft saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the draft.");
    } finally {
      setSaving(false);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copied.`);
    } catch {
      setError("Clipboard access was blocked. Select the draft text and copy it manually.");
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([draft], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(active?.title || "medium-article")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "medium-article"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Markdown downloaded.");
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-[var(--muted)]">Loading Social Studio…</div>;
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Social Studio"
        description="Turn verified resume experience into thoughtful LinkedIn content and publication-ready Medium drafts."
        badge={<Badge tone="primary">Resume-grounded writing</Badge>}
        action={
          <Button onClick={createProject} disabled={busy} variant="gradient">
            + New {platform === "linkedin" ? "post" : "article"}
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <TabBar
          tabs={[
            { id: "linkedin", label: "LinkedIn Studio" },
            { id: "medium", label: "Medium Article" },
          ]}
          active={platform}
          onChange={changePlatform}
        />
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              profile ? "bg-emerald-400" : "bg-amber-400"
            )}
          />
          {profile ? `Grounded in ${profile.source_filename || "current base resume"}` : "Base resume required"}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_minmax(19rem,0.8fr)]">
        <Card className="min-w-0 p-3 xl:max-h-[calc(100dvh-13rem)] xl:overflow-y-auto">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Drafts
            </p>
            <span className="text-xs text-[var(--muted-2)]">{platformProjects.length}</span>
          </div>
          <div className="space-y-1.5">
            {platformProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => void selectProject(project)}
                className={cn(
                  "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active?.id === project.id
                    ? "border-violet-400/40 bg-violet-500/12"
                    : "border-transparent hover:bg-[var(--panel-2)]"
                )}
              >
                <span className="block truncate text-sm font-medium">{project.title}</span>
                <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                  {project.current_content || "Empty workspace"}
                </span>
              </button>
            ))}
            {!platformProjects.length && (
              <p className="px-2 py-8 text-center text-xs leading-relaxed text-[var(--muted)]">
                Create your first {platform === "linkedin" ? "post" : "article"} workspace.
              </p>
            )}
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card gradient className="min-w-0 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Content type</Label>
                <div className="flex flex-wrap gap-2">
                  {presets.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, preset: id }))}
                      data-active={settings.preset === id}
                      className="tab-pill rounded-lg border px-2.5 py-1.5 text-xs text-[var(--muted)]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="social-topic">Target topic</Label>
                <Input
                  id="social-topic"
                  value={settings.topic}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, topic: event.target.value }))
                  }
                  placeholder="Optional — leave blank for a resume-supported angle"
                />
              </div>
              <div>
                <Label htmlFor="social-audience">Audience</Label>
                <Input
                  id="social-audience"
                  value={settings.audience}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, audience: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="social-tone">Tone</Label>
                <Select
                  id="social-tone"
                  value={settings.tone}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, tone: event.target.value }))
                  }
                >
                  <option>Clear, human, and confident</option>
                  <option>Conversational and warm</option>
                  <option>Direct and technical</option>
                  <option>Reflective and personal</option>
                  <option>Concise and punchy</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="social-goal">Goal</Label>
                <Input
                  id="social-goal"
                  value={settings.goal}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, goal: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="social-format">Format</Label>
                <Select
                  id="social-format"
                  value={settings.format}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, format: event.target.value }))
                  }
                >
                  {(platform === "linkedin"
                    ? ["LinkedIn post", "Hook options", "Carousel outline", "Comment / reply"]
                    : ["Outline first", "Full article", "Single section", "LinkedIn teaser"]
                  ).map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="social-context">Extra context (treated as your input, not resume fact)</Label>
                <Input
                  id="social-context"
                  value={settings.extra_context}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, extra_context: event.target.value }))
                  }
                  placeholder="A recent observation, opinion, or detail you want included"
                />
              </div>
            </div>
          </Card>

          <Card className="flex min-h-[32rem] min-w-0 flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{active?.title || "Conversation"}</p>
                <p className="text-xs text-[var(--muted)]">Ask for hooks, refinements, sections, comments, or rewrites.</p>
              </div>
              {active && (
                <Button onClick={deleteProject} disabled={busy} variant="ghost" size="sm">
                  Delete
                </Button>
              )}
            </div>
            <div ref={threadRef} className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-4 py-4">
              {!messages.length && !busy && (
                <div className="mx-auto max-w-xl py-6 text-center">
                  <h2 className="text-lg font-semibold">Start with a focused request</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Every response uses your canonical base resume as its factual boundary.
                  </p>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {STARTERS[platform].map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        disabled={!active}
                        onClick={() => void send(starter)}
                        className="rounded-xl border bg-[var(--panel-2)] px-3 py-3 text-left text-sm text-[var(--text-secondary)] transition-colors hover:border-violet-400/40 disabled:opacity-50"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "min-w-0 max-w-full rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "ml-auto w-fit max-w-[88%] bg-violet-500/15"
                      : "border bg-[var(--panel-2)]"
                  )}
                >
                  {message.role === "assistant" ? (
                    <>
                      <ChatMarkdown content={message.content} density="compact" />
                      <button
                        type="button"
                        onClick={() => void copyText(message.content, "Response")}
                        className="mt-2 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        Copy response
                      </button>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
                  )}
                </div>
              ))}
              {streamText && (
                <div className="min-w-0 rounded-2xl border bg-[var(--panel-2)] px-4 py-3">
                  <ChatMarkdown content={streamText} density="compact" />
                </div>
              )}
              {busy && !streamText && (
                <p className="text-sm text-[var(--muted)]">Writing from verified resume context…</p>
              )}
            </div>
            <div className="border-t bg-[var(--panel)] p-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={3}
                placeholder={
                  active
                    ? "Try: stronger hook, less corporate, shorten, expand section 2, remove emoji…"
                    : "Create a draft workspace to begin"
                }
                disabled={!active || busy}
                className="input-field w-full resize-none rounded-xl border bg-[var(--panel-2)] p-3 text-sm outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <ModelSelector
                  models={models}
                  selectedId={selectedModel}
                  onChange={setSelectedModel}
                  disabled={busy}
                />
                <div className="flex gap-2">
                  {busy && (
                    <Button onClick={() => abortRef.current?.abort()} variant="ghost" size="sm">
                      Stop
                    </Button>
                  )}
                  <Button onClick={() => void send()} disabled={!active || busy || !input.trim()} size="sm">
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="min-w-0 p-4 xl:sticky xl:top-20">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">
                  {platform === "linkedin" ? "Final LinkedIn draft" : "Article Markdown"}
                </h2>
                <p className="text-xs text-[var(--muted)]">Editable and saved to this project</p>
              </div>
              <Badge tone={overSoftTarget ? "amber" : "default"}>
                {platform === "linkedin"
                  ? `${draft.length.toLocaleString()} characters`
                  : `${draft.trim() ? draft.trim().split(/\s+/).length.toLocaleString() : 0} words`}
              </Badge>
            </div>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={22}
              placeholder="Your generated draft will appear here."
              className="input-field min-h-[28rem] w-full max-w-full resize-y rounded-xl border bg-[#0f0f18] p-4 font-mono text-[13px] leading-relaxed text-[var(--text-secondary)] outline-none [overflow-wrap:anywhere]"
            />
            {platform === "linkedin" && (
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                <span>
                  Soft target only; LinkedIn platform limits may vary by content type and account.
                </span>
                <label className="flex shrink-0 items-center gap-1">
                  Target
                  <input
                    type="number"
                    min="500"
                    step="100"
                    value={settings.soft_target}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, soft_target: event.target.value }))
                    }
                    className="w-16 rounded border bg-[var(--panel-2)] px-1.5 py-1 text-right"
                  />
                </label>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={saveDraft} disabled={!active || saving} size="sm">
                {saving ? "Saving…" : "Save draft"}
              </Button>
              <Button
                onClick={() =>
                  void copyText(draft, platform === "linkedin" ? "LinkedIn draft" : "Markdown")
                }
                disabled={!draft}
                variant="outline"
                size="sm"
              >
                {platform === "linkedin" ? "Copy for LinkedIn" : "Copy Markdown"}
              </Button>
              {platform === "medium" && (
                <Button onClick={downloadMarkdown} disabled={!draft} variant="outline" size="sm">
                  Download .md
                </Button>
              )}
              <Button
                onClick={() => void send("Regenerate the current draft using the same verified facts and creative direction.")}
                disabled={!active || busy}
                variant="ghost"
                size="sm"
              >
                Regenerate
              </Button>
            </div>
            <a
              href={
                platform === "linkedin"
                  ? publishing?.linkedin.handoff_url || "https://www.linkedin.com/feed/?shareActive=true"
                  : publishing?.medium.handoff_url || "https://medium.com/new-story"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="btn-interactive mt-2 inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-medium hover:bg-[var(--panel-2)]"
            >
              Open {platform === "linkedin" ? "LinkedIn" : "Medium editor"} ↗
            </a>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <h3 className="text-sm font-semibold">Publishing connection</h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              {publishing?.note ||
                "LinkedIn and Medium are not connected. ApplyEngine saves and exports drafts; final publishing happens on the platform."}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted-2)]">
              Opening an editor does not auto-fill or publish your content. Copy the draft first, then review it on the platform.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
