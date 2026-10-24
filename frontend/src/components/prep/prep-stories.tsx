"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PrepStory, PrepStoryInput, PrepTarget, PrepTargetInput } from "@/lib/types";
import { Badge, Button, Card, Input, Label, PageHeader, PageSkeleton, Textarea, cn } from "@/components/ui";
import { MarkdownPanel } from "@/components/shared/markdown-panel";
import { PrepNav } from "./prep-nav";

/** What behavioural rounds probe across FAANG and AI labs. */
const COMPETENCIES = [
  "ownership",
  "impact & results",
  "ambiguity",
  "conflict & disagreement",
  "failure & learning",
  "leadership & influence",
  "customer focus",
  "technical depth",
  "speed & bias for action",
  "collaboration",
  "mission & AI safety",
  "raising the bar",
];

const AMAZON_PRINCIPLES = [
  "Customer Obsession",
  "Ownership",
  "Invent and Simplify",
  "Are Right, A Lot",
  "Learn and Be Curious",
  "Hire and Develop the Best",
  "Insist on the Highest Standards",
  "Think Big",
  "Bias for Action",
  "Frugality",
  "Earn Trust",
  "Dive Deep",
  "Have Backbone; Disagree and Commit",
  "Deliver Results",
  "Strive to be Earth's Best Employer",
  "Success and Scale Bring Broad Responsibility",
];

const EMPTY_STORY: PrepStoryInput = {
  title: "",
  situation: "",
  task: "",
  action: "",
  result: "",
  tags: [],
  companies: [],
};

const EMPTY_TARGET: PrepTargetInput = { company: "", role: "", why: "", questions: "" };

function TagPicker({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              on
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
            style={on ? undefined : { borderColor: "var(--border)" }}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function StoryForm({
  initial,
  companies,
  onSave,
  onCancel,
}: {
  initial: PrepStoryInput;
  companies: string[];
  onSave: (story: PrepStoryInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [story, setStory] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [showAmazon, setShowAmazon] = useState(initial.tags.some((t) => AMAZON_PRINCIPLES.includes(t)));
  const set = (field: keyof PrepStoryInput) => (value: string) => setStory((s) => ({ ...s, [field]: value }));
  const toggle = (field: "tags" | "companies") => (option: string) =>
    setStory((s) => ({
      ...s,
      [field]: s[field].includes(option) ? s[field].filter((x) => x !== option) : [...s[field], option],
    }));

  const fields: Array<{ key: "situation" | "task" | "action" | "result"; label: string; hint: string }> = [
    { key: "situation", label: "Situation", hint: "Context in 1-2 sentences: team, product, stakes." },
    { key: "task", label: "Task", hint: "What you specifically owned or had to achieve." },
    { key: "action", label: "Action", hint: "What YOU did, step by step, and the judgement calls. Most of the story." },
    { key: "result", label: "Result", hint: "Outcome with numbers, and what you learned." },
  ];

  return (
    <Card className="space-y-4">
      <div>
        <Label htmlFor="story-title">Title</Label>
        <Input
          id="story-title"
          value={story.title}
          onChange={(e) => set("title")(e.target.value)}
          placeholder="e.g. Cut eval runtime from 9 hours to 40 minutes"
        />
      </div>
      {fields.map((field) => (
        <div key={field.key}>
          <Label htmlFor={`story-${field.key}`}>{field.label}</Label>
          <Textarea value={story[field.key]} onChange={set(field.key)} rows={field.key === "action" ? 5 : 3} placeholder={field.hint} />
        </div>
      ))}
      <div className="space-y-2">
        <p className="text-xs font-medium text-[var(--muted)]">Competencies it shows</p>
        <TagPicker options={COMPETENCIES} selected={story.tags} onToggle={toggle("tags")} />
        <button
          type="button"
          onClick={() => setShowAmazon((v) => !v)}
          className="text-xs font-medium text-[var(--primary-2)] hover:underline"
        >
          {showAmazon ? "Hide" : "Show"} Amazon Leadership Principles
        </button>
        {showAmazon && (
          <TagPicker options={AMAZON_PRINCIPLES} selected={story.tags} onToggle={toggle("tags")} />
        )}
      </div>
      {companies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--muted)]">Use it for</p>
          <TagPicker options={companies} selected={story.companies} onToggle={toggle("companies")} />
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving || !story.title.trim()}
          onClick={() => {
            setSaving(true);
            onSave(story).finally(() => setSaving(false));
          }}
        >
          {saving ? "Saving…" : "Save story"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function TargetsCard({ targets, onChange }: { targets: PrepTarget[]; onChange: () => void }) {
  const [draft, setDraft] = useState<PrepTargetInput>(EMPTY_TARGET);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const request =
      editing === "new" ? api.createPrepTarget(draft) : api.updatePrepTarget(editing as number, draft);
    request
      .then(() => {
        setEditing(null);
        setDraft(EMPTY_TARGET);
        onChange();
      })
      .catch((err: Error) => setError(err.message));
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">Target companies</h2>
        {editing === null && (
          <Button size="sm" variant="outline" onClick={() => { setDraft(EMPTY_TARGET); setEditing("new"); }}>
            Add company
          </Button>
        )}
      </div>
      <p className="text-xs text-[var(--muted)]">
        Write your own &quot;why this company&quot; and the questions you&apos;ll ask. Check each
        company&apos;s careers page for its current values, and tag stories to them.
      </p>
      {targets.length === 0 && editing === null && (
        <p className="text-sm text-[var(--muted)]">No companies yet.</p>
      )}
      <ul className="space-y-3">
        {targets.map((t) => (
          <li key={t.id} className="rounded-[var(--radius-md)] border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--text)]">
                {t.company} {t.role && <span className="font-normal text-[var(--muted)]">· {t.role}</span>}
              </p>
              <div className="flex gap-3 text-xs">
                <button type="button" className="text-[var(--muted)] hover:text-[var(--text)]" onClick={() => { setDraft(t); setEditing(t.id); }}>
                  Edit
                </button>
                <button
                  type="button"
                  className="text-[var(--muted)] hover:text-[var(--red)]"
                  onClick={() => window.confirm(`Remove ${t.company}?`) && api.deletePrepTarget(t.id).then(onChange)}
                >
                  Remove
                </button>
              </div>
            </div>
            {t.why && <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{t.why}</p>}
            {t.questions && (
              <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--muted)]">Questions: {t.questions}</p>
            )}
          </li>
        ))}
      </ul>
      {editing !== null && (
        <div className="space-y-3 rounded-[var(--radius-md)] border p-3" style={{ borderColor: "var(--border)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="target-company">Company</Label>
              <Input id="target-company" value={draft.company} onChange={(e) => setDraft((prev) => ({ ...prev, company: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="target-role">Role</Label>
              <Input id="target-role" value={draft.role} onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Why this company (your words)</Label>
            <Textarea value={draft.why} onChange={(why) => setDraft((prev) => ({ ...prev, why }))} rows={3} />
          </div>
          <div>
            <Label>Questions you&apos;ll ask them</Label>
            <Textarea value={draft.questions} onChange={(questions) => setDraft((prev) => ({ ...prev, questions }))} rows={2} />
          </div>
          {error && <p className="text-sm text-[var(--red)]">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={!draft.company.trim()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function PrepStories() {
  const [stories, setStories] = useState<PrepStory[] | null>(null);
  const [targets, setTargets] = useState<PrepTarget[]>([]);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [critiquing, setCritiquing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([api.listPrepStories(), api.listPrepTargets()])
      .then(([s, t]) => {
        setStories(s);
        setTargets(t);
      })
      .catch((err: Error) => setError(err.message));
  };
  useEffect(load, []);

  if (!stories && !error) return <PageSkeleton />;

  const counts = new Map(COMPETENCIES.map((c) => [c, 0]));
  for (const story of stories ?? []) for (const tag of story.tags) if (counts.has(tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const gaps = COMPETENCIES.filter((c) => !counts.get(c));

  const save = (id: number | "new") => (story: PrepStoryInput) =>
    (id === "new" ? api.createPrepStory(story) : api.updatePrepStory(id, story))
      .then(() => {
        setEditing(null);
        load();
      })
      .catch((err: Error) => setError(err.message));

  const critique = (id: number) => {
    setCritiquing(id);
    api
      .critiquePrepStory(id)
      .then((updated) => setStories((all) => all?.map((s) => (s.id === id ? updated : s)) ?? null))
      .catch((err: Error) => setError(err.message))
      .finally(() => setCritiquing(null));
  };

  return (
    <div className="page-shell mx-auto max-w-4xl space-y-5 pb-12">
      <PrepNav />
      <PageHeader
        title="Story bank"
        description="8-10 STAR stories that together cover every competency, ready to tell in about 2 minutes each."
        action={
          editing === null ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              New story
            </Button>
          ) : undefined
        }
      />
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text)]">Coverage</h2>
          <span className="text-xs text-[var(--muted)]">
            {stories?.length ?? 0} {stories?.length === 1 ? "story" : "stories"} ·{" "}
            {gaps.length ? `${gaps.length} competencies with no story` : "every competency covered"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COMPETENCIES.map((c) => (
            <span
              key={c}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                counts.get(c) ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/40 text-amber-300"
              )}
            >
              {c} · {counts.get(c)}
            </span>
          ))}
        </div>
      </Card>

      {editing === "new" && (
        <StoryForm
          initial={EMPTY_STORY}
          companies={targets.map((t) => t.company)}
          onSave={save("new")}
          onCancel={() => setEditing(null)}
        />
      )}

      {stories?.length === 0 && editing !== "new" && (
        <Card>
          <p className="text-sm text-[var(--muted)]">
            No stories yet. Start with your strongest: a time you owned a hard problem end to end.
          </p>
        </Card>
      )}

      {stories?.map((story) =>
        editing === story.id ? (
          <StoryForm
            key={story.id}
            initial={story}
            companies={targets.map((t) => t.company)}
            onSave={save(story.id)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Card key={story.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-[var(--text)]">{story.title}</h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {story.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                  {story.companies.map((c) => (
                    <Badge key={c} tone="primary">{c}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <button type="button" className="text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setEditing(story.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="text-[var(--muted)] hover:text-[var(--red)]"
                  onClick={() => window.confirm(`Delete "${story.title}"?`) && api.deletePrepStory(story.id).then(load)}
                >
                  Delete
                </button>
              </div>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-[90px_1fr]">
              {(["situation", "task", "action", "result"] as const).map((field) => (
                <div key={field} className="contents">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{field}</dt>
                  <dd className="whitespace-pre-wrap text-[var(--text-secondary)]">{story[field] || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={() => critique(story.id)} disabled={critiquing === story.id}>
                {critiquing === story.id ? "Reviewing…" : story.critique ? "Review again" : "Get feedback"}
              </Button>
            </div>
            {story.critique && <MarkdownPanel title="Feedback" markdown={story.critique} collapsible defaultOpen={critiquing === null} />}
          </Card>
        )
      )}

      <TargetsCard targets={targets} onChange={load} />
    </div>
  );
}
