"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PrepItem, PrepToday } from "@/lib/types";
import { Badge, Button, Card, Input, Label, PageHeader, PageSkeleton } from "@/components/ui";
import { Checklist, type ChecklistItem } from "@/components/shared/checklist";
import { MarkdownPanel } from "@/components/shared/markdown-panel";
import { ProgressRing } from "@/components/shared/progress-ring";
import { StreakBadge } from "@/components/shared/streak-badge";
import { TaskCard } from "@/components/shared/task-card";
import { WeekStrip } from "@/components/shared/week-strip";
import { addDays, localISODate, shortDate } from "./dates";
import { PrepNav } from "./prep-nav";

function nextMonday(): string {
  const d = new Date();
  const offset = (8 - d.getDay()) % 7;
  d.setDate(d.getDate() + offset);
  return localISODate(d);
}

function linkLabel(url: string | null): string {
  if (!url) return "Open";
  if (url.includes("leetcode.com")) return "LeetCode";
  if (url.includes("neetcode.io")) return "NeetCode";
  return "Open";
}

export function sessionHref(item: PrepItem): string {
  return `/prep/session/${encodeURIComponent(item.task_id)}`;
}

function toChecklistItem(item: PrepItem): ChecklistItem {
  const parts = [item.pattern, `${item.target_minutes} min`];
  if (item.due_date) parts.push(`due ${item.due_date}`);
  if (item.stretch) parts.push("stretch");
  return {
    id: item.key,
    label: item.title,
    checked: item.done,
    sublabel: parts.filter(Boolean).join(" · "),
    href: item.url,
    linkLabel: linkLabel(item.url),
    badge: item.badge,
    badgeTone: item.redo_id || item.badge === "Review · 30d"
      ? "amber"
      : item.badge === "Carried over" || item.badge === "Weak spot"
        ? "red"
        : item.difficulty === "easy"
          ? "green"
          : item.difficulty === "medium"
            ? "primary"
            : item.difficulty === "hard"
              ? "red"
              : item.slot === "weekly"
                ? "primary"
                : "default",
    // Finished items stay openable: their review, solution and submissions live there.
    trailing: (
      <Link
        href={sessionHref(item)}
        className={
          item.done
            ? "rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
            : "rounded-[var(--radius-md)] border px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--panel-2)]"
        }
        style={item.done ? undefined : { borderColor: "var(--border)" }}
      >
        {item.done ? "Review" : "Start"}
      </Link>
    ),
  };
}

function streakLine(today: PrepToday): string {
  const s = today.streak;
  if (!s) return "";
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  if (s.needed_today === 0) {
    return s.current > 1 ? `Today counts. ${s.current}-day streak.` : "Today counts.";
  }
  const more = `${s.needed_today} more`;
  if (s.paused) {
    const missed = `Paused after ${days(s.missed_days)} off.`;
    return s.grace_left === 0
      ? `${missed} Finish ${more} today or your ${s.current}-day streak resets.`
      : `${missed} Finish ${more} today to resume your ${s.current}-day streak. You can miss ${days(s.grace_left)} more without losing it.`;
  }
  return s.current > 0
    ? `${more} to keep your ${s.current}-day streak.`
    : `${more} to start a streak.`;
}

/** Previous / next day, a date picker and a way back to today. */
function DayNav({
  date,
  isToday,
  onChange,
}: {
  date: string;
  isToday: boolean;
  onChange: (date: string) => void;
}) {
  const step =
    "rounded-[var(--radius-md)] border px-2.5 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--panel-2)]";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={step}
        style={{ borderColor: "var(--border)" }}
        onClick={() => onChange(addDays(date, -1))}
        aria-label="Previous day"
      >
        ←
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="Choose a day"
        className="rounded-[var(--radius-md)] border bg-[var(--panel)] px-2.5 py-1.5 text-sm text-[var(--text)] [color-scheme:dark]"
        style={{ borderColor: "var(--border)" }}
      />
      <button
        type="button"
        className={step}
        style={{ borderColor: "var(--border)" }}
        onClick={() => onChange(addDays(date, 1))}
        aria-label="Next day"
      >
        →
      </button>
      {isToday ? (
        <Badge tone="primary">Today</Badge>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => onChange(localISODate())}>
          Back to today
        </Button>
      )}
    </div>
  );
}

export function PrepToday() {
  // `date` is the day on screen; `today` is the browser's calendar day.
  const [view, setView] = useState(() => {
    const now = localISODate();
    return { date: now, today: now };
  });
  const { date } = view;
  const isToday = view.date === view.today;
  const setDate = useCallback((next: string) => setView((v) => ({ ...v, date: next })), []);
  const [today, setToday] = useState<PrepToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback((day: string) => {
    api
      .getPrepToday(day)
      .then((data) => {
        setToday(data);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  // Paging quickly through days: only the latest request's answer is shown.
  useEffect(() => {
    let current = true;
    api
      .getPrepToday(date)
      .then((data) => {
        if (!current) return;
        setToday(data);
        setError(null);
      })
      .catch((err: Error) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [date]);

  // A tab left open overnight rolls over to the new day, unless you were looking at another day.
  useEffect(() => {
    const onFocus = () =>
      setView((v) => {
        const now = localISODate();
        if (v.today === now) return v;
        return { today: now, date: v.date === v.today ? now : v.date };
      });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (!today && !error) return <PageSkeleton />;
  if (!today) {
    return (
      <div className="page-shell mx-auto max-w-4xl">
        <PageHeader title="Interview Prep" />
        <Card><p className="text-sm text-[var(--red)]">{error}</p></Card>
      </div>
    );
  }
  if (!today.configured) return <PrepSetup onSaved={() => load(date)} />;

  if (today.status === "not_started") {
    return (
      <div className="page-shell mx-auto max-w-4xl">
        <PageHeader title={today.program_name} description={`Starts ${today.start_date}.`} />
        <DayNav date={date} isToday={isToday} onChange={setDate} />
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">
            {isToday ? "Week 1 begins" : `On ${shortDate(date)}, week 1 begins`} in{" "}
            {today.days_until_start} {today.days_until_start === 1 ? "day" : "days"}. Nothing is due yet.
          </p>
        </Card>
      </div>
    );
  }

  const sections: Array<{ title: string; items: PrepItem[]; empty: string; note?: string }> = [
    { title: "Redo", items: today.redos, empty: "No redos due." },
    {
      title: "Long-term review",
      items: today.review,
      empty: "",
      note: "Solved cleanly 30+ days ago. Redo it from a blank editor to check it stuck; if it doesn't come back cleanly, it returns as a redo.",
    },
    {
      title: "Morning · DSA",
      items: today.morning,
      empty: "This week's DSA is done. Clear any redos above.",
      note: today.dsa_backlog > 0 ? `${today.dsa_backlog} more DSA queued behind these.` : undefined,
    },
    { title: "Evening", items: today.evening, empty: "Nothing scheduled this evening." },
    { title: "Weekend · Project", items: today.weekend, empty: "" },
    { title: "Carried over", items: today.carried, empty: "" },
    {
      title: "This week",
      items: today.weekly,
      empty: "",
      note: "Fundamentals, the multi-level challenge, and classic system design and OOD problems. Do them any day this week; they count toward the week's progress.",
    },
    {
      title: "Extra practice · optional",
      items: today.extra,
      empty: "",
      note:
        "One easy and two medium on this week's pattern, plus a hard from week 3. They change daily and don't count toward today's total, but finishing them still counts for your streak." +
        (today.focus_pattern
          ? ` One medium targets your weakest pattern, ${today.focus_pattern}.`
          : ""),
    },
  ];
  const upNext = [...today.redos, ...today.review, ...today.morning, ...today.evening, ...today.weekend].find(
    (i) => !i.done
  );
  const pct = today.total_count ? (today.done_count / today.total_count) * 100 : 0;

  return (
    <div className="page-shell mx-auto max-w-4xl space-y-5 pb-12">
      <PrepNav />
      <PageHeader
        title={today.program_name}
        description={`Week ${today.week} of ${today.weeks} · ${shortDate(today.date)}`}
        action={
          today.doc_url ? (
            <a
              href={today.doc_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[var(--primary-2)] hover:underline"
            >
              Full plan ↗
            </a>
          ) : undefined
        }
      />

      <DayNav date={date} isToday={isToday} onChange={setDate} />
      {!isToday && (
        <p className="text-sm text-[var(--muted)]">
          {date < view.today
            ? `Showing what was planned and done on ${shortDate(date)}. Open any task to see its submissions and review; anything you log now counts for today.`
            : `A preview of ${shortDate(date)}. Redos and extras can still change before then.`}
        </p>
      )}

      {today.feedback && (
        <MarkdownPanel
          title={`Feedback for ${shortDate(today.feedback.date)}`}
          markdown={today.feedback.markdown}
          collapsible
        />
      )}

      <Card className="flex flex-wrap items-center gap-5">
        <ProgressRing value={pct} label={isToday ? "today" : shortDate(date)} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {today.streak && date <= view.today && (
              <StreakBadge
                current={today.streak.current}
                best={today.streak.best}
                paused={today.streak.paused}
              />
            )}
            <div>
              <p className="text-sm font-medium text-[var(--text)]">
                {today.done_count} of {today.total_count} done {isToday ? "today" : `on ${shortDate(date)}`}
              </p>
              {isToday && <p className="text-xs text-[var(--muted)]">{streakLine(today)}</p>}
            </div>
          </div>
          <WeekStrip days={today.week_strip} selected={date} onSelect={setDate} />
        </div>
      </Card>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      {upNext && isToday && (
        <TaskCard
          task={{
            title: upNext.title,
            type: upNext.type,
            targetMinutes: upNext.target_minutes,
            url: upNext.url,
            linkLabel: linkLabel(upNext.url),
            subtitle: upNext.badge ? `${upNext.badge}${upNext.pattern ? ` · ${upNext.pattern}` : ""}` : upNext.pattern,
          }}
          status="todo"
          onStart={() => router.push(sessionHref(upNext))}
        />
      )}

      {sections
        .filter((s) => s.items.length > 0 || s.empty)
        .map((section) => (
          <Card key={section.title}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-[var(--text)]">{section.title}</h2>
              <span className="text-xs tabular-nums text-[var(--muted)]">
                {section.items.filter((i) => i.done).length}/{section.items.length}
              </span>
            </div>
            <Checklist
              items={section.items.map(toChecklistItem)}
              emptyText={section.empty}
            />
            {section.note && <p className="mt-1 text-xs text-[var(--muted)]">{section.note}</p>}
          </Card>
        ))}
    </div>
  );
}

function PrepSetup({ onSaved }: { onSaved: () => void }) {
  const [start, setStart] = useState(nextMonday);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    api
      .savePrepSettings({ start_date: start })
      .then(onSaved)
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="page-shell mx-auto max-w-xl">
      <PageHeader
        title="Interview Prep"
        description="A 10-week Applied AI prep program: daily DSA, drills, design and a project."
      />
      <Card className="space-y-4">
        <div>
          <Label htmlFor="prep-start">Start date (Monday of week 1)</Label>
          <Input
            id="prep-start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStart(localISODate())}>
              Start today
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStart(nextMonday())}>
              Next Monday
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-[var(--red)]">{error}</p>}
        <Button onClick={save} disabled={saving || !start}>
          {saving ? "Saving…" : "Start the program"}
        </Button>
      </Card>
    </div>
  );
}
