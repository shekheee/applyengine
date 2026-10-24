"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PrepMock, PrepMockInput, PrepMockKind } from "@/lib/types";
import { Badge, Button, Card, Input, Label, PageHeader, PageSkeleton, Select, Textarea } from "@/components/ui";
import { RatingInput } from "@/components/shared/rating-input";
import { localISODate, shortDate } from "./dates";
import { PrepNav } from "./prep-nav";

const MOCK_GOAL = 10;

const KINDS: Record<PrepMockKind, string> = {
  dsa: "DSA",
  practical: "Practical coding",
  lld: "Low-level design",
  system_design: "System design",
  ml: "ML / LLM",
  behavioral: "Behavioural",
};

const newMock = (): PrepMockInput => ({
  date: localISODate(),
  kind: "dsa",
  company: "",
  platform: "",
  duration_minutes: 45,
  score: 3,
  went_well: "",
  to_improve: "",
});

function MockForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: PrepMockInput;
  onSave: (mock: PrepMockInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [mock, setMock] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <Card className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="mock-date">Date</Label>
          <Input id="mock-date" type="date" value={mock.date} onChange={(e) => setMock((prev) => ({ ...prev, date: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="mock-kind">Round</Label>
          <Select id="mock-kind" value={mock.kind} onChange={(e) => setMock((prev) => ({ ...prev, kind: e.target.value as PrepMockKind }))}>
            {Object.entries(KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="mock-minutes">Minutes</Label>
          <Input
            id="mock-minutes"
            type="number"
            min={5}
            value={mock.duration_minutes}
            onChange={(e) => setMock((prev) => ({ ...prev, duration_minutes: Number(e.target.value) || 45 }))}
          />
        </div>
        <div>
          <Label htmlFor="mock-company">Company style</Label>
          <Input id="mock-company" value={mock.company} placeholder="e.g. Anthropic" onChange={(e) => setMock((prev) => ({ ...prev, company: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="mock-platform">With</Label>
          <Input id="mock-platform" value={mock.platform} placeholder="Peer, interviewing.io, Pramp…" onChange={(e) => setMock((prev) => ({ ...prev, platform: e.target.value }))} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">How it went</p>
          <RatingInput value={mock.score} onChange={(score) => setMock((prev) => ({ ...prev, score }))} label="Mock score" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Went well</Label>
          <Textarea value={mock.went_well} onChange={(went_well) => setMock((prev) => ({ ...prev, went_well }))} rows={3} />
        </div>
        <div>
          <Label>To improve</Label>
          <Textarea value={mock.to_improve} onChange={(to_improve) => setMock((prev) => ({ ...prev, to_improve }))} rows={3} placeholder="The specific thing to drill before the next one" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            onSave(mock).finally(() => setSaving(false));
          }}
        >
          {saving ? "Saving…" : "Save mock"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function PrepMocks() {
  const [mocks, setMocks] = useState<PrepMock[] | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .listPrepMocks()
      .then(setMocks)
      .catch((err: Error) => setError(err.message));
  };
  useEffect(load, []);

  if (!mocks && !error) return <PageSkeleton />;

  const all = mocks ?? [];
  const byKind = Object.keys(KINDS).map((kind) => ({
    kind: kind as PrepMockKind,
    count: all.filter((m) => m.kind === kind).length,
  }));
  const average = all.length ? all.reduce((sum, m) => sum + m.score, 0) / all.length : 0;
  const recent = all.slice(0, 5).reverse();

  const save = (id: number | "new") => (mock: PrepMockInput) =>
    (id === "new" ? api.createPrepMock(mock) : api.updatePrepMock(id, mock))
      .then(() => {
        setEditing(null);
        load();
      })
      .catch((err: Error) => setError(err.message));

  return (
    <div className="page-shell mx-auto max-w-4xl space-y-5 pb-12">
      <PrepNav />
      <PageHeader
        title="Mock interviews"
        description={`Aim for ${MOCK_GOAL}+ across every round type before real loops. Write down the one thing to fix each time.`}
        action={
          editing === null ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              Log a mock
            </Button>
          ) : undefined
        }
      />
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-4">
          <p className="text-2xl font-semibold tabular-nums text-[var(--text)]">
            {all.length}
            <span className="text-base font-normal text-[var(--muted)]"> / {MOCK_GOAL}</span>
          </p>
          <p className="text-sm text-[var(--muted)]">
            {all.length ? `average ${average.toFixed(1)} / 5` : "no mocks yet"}
            {recent.length > 1 && ` · last ${recent.length}: ${recent.map((m) => m.score).join(" → ")}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {byKind.map(({ kind, count }) => (
            <Badge key={kind} tone={count ? "green" : "amber"}>
              {KINDS[kind]} · {count}
            </Badge>
          ))}
        </div>
      </Card>

      {editing === "new" && <MockForm initial={newMock()} onSave={save("new")} onCancel={() => setEditing(null)} />}

      {all.map((mock) =>
        editing === mock.id ? (
          <MockForm key={mock.id} initial={mock} onSave={save(mock.id)} onCancel={() => setEditing(null)} />
        ) : (
          <Card key={mock.id} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--text)]">
                {KINDS[mock.kind]}
                <span className="font-normal text-[var(--muted)]">
                  {" "}· {shortDate(mock.date)} · {mock.duration_minutes} min
                  {mock.company && ` · ${mock.company}`}
                  {mock.platform && ` · ${mock.platform}`}
                </span>
              </p>
              <div className="flex items-center gap-3 text-xs">
                <Badge tone={mock.score >= 4 ? "green" : mock.score >= 3 ? "amber" : "red"}>{mock.score} / 5</Badge>
                <button type="button" className="text-[var(--muted)] hover:text-[var(--text)]" onClick={() => setEditing(mock.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="text-[var(--muted)] hover:text-[var(--red)]"
                  onClick={() => window.confirm("Delete this mock?") && api.deletePrepMock(mock.id).then(load)}
                >
                  Delete
                </button>
              </div>
            </div>
            {mock.went_well && <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">✓ {mock.went_well}</p>}
            {mock.to_improve && <p className="whitespace-pre-wrap text-sm text-amber-300">→ {mock.to_improve}</p>}
          </Card>
        )
      )}
    </div>
  );
}
