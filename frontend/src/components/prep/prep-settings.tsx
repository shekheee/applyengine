"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PrepReviewToken, PrepSettings } from "@/lib/types";
import { Button, Card, Input, Label, PageHeader, PageSkeleton } from "@/components/ui";
import { localISODate } from "./dates";
import { PrepNav } from "./prep-nav";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "never";
}

export function PrepSettingsView() {
  const [settings, setSettings] = useState<PrepSettings | null>(null);
  const [token, setToken] = useState<PrepReviewToken | null>(null);
  const [start, setStart] = useState("");
  const [logDate, setLogDate] = useState(localISODate);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([api.getPrepSettings(), api.getPrepReviewToken()])
      .then(([s, t]) => {
        setSettings(s);
        setStart(s.start_date ?? "");
        setToken(t);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const act = (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    work()
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  const saveStart = () =>
    act(async () => {
      const saved = await api.savePrepSettings({
        start_date: start,
        hours_per_week: settings?.hours_per_week,
      });
      setSettings(saved);
      setMessage("Start date saved. Today's tasks now follow the new date.");
    });

  const issueToken = () => {
    if (token?.exists && !window.confirm("Replace the token? The old one stops working.")) return;
    act(async () => {
      setToken(await api.createPrepReviewToken());
      setCopied(false);
    });
  };

  const revokeToken = () => {
    if (!window.confirm("Revoke the token? The nightly review stops until you create a new one.")) return;
    act(async () => {
      await api.deletePrepReviewToken();
      setToken({ exists: false, created_at: null, last_used_at: null, token: null });
    });
  };

  const exportLog = () =>
    act(async () => {
      const log = await api.getPrepLog(logDate);
      const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${logDate}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });

  const copyToken = () => {
    if (!token?.token) return;
    navigator.clipboard
      .writeText(token.token)
      .then(() => setCopied(true))
      .catch(() => setError("Copy failed; select the token and copy it by hand."));
  };

  if (!settings && !error) return <PageSkeleton />;

  return (
    <div className="page-shell mx-auto max-w-3xl space-y-5 pb-12">
      <PrepNav />
      <PageHeader title="Settings" />
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
      {message && <p className="text-sm text-[var(--green)]">{message}</p>}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Program</h2>
        <div className="max-w-xs">
          <Label htmlFor="settings-start">Start date (Monday of week 1)</Label>
          <Input
            id="settings-start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <p className="text-xs text-[var(--muted)]">
          Moving the start date moves every week. Logged attempts and redos stay as they are.
        </p>
        <Button
          size="sm"
          onClick={saveStart}
          disabled={busy || !start || start === settings?.start_date}
        >
          Save start date
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Nightly review token</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          <code>scripts/prep_daily_review.sh</code>{" "}uses this token to read each day&apos;s log
          and upload Claude&apos;s review. It cannot reach anything else in your account.
        </p>
        {token?.token ? (
          <div className="space-y-2 rounded-[var(--radius-md)] border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-xs font-medium text-amber-200">
              Copy it now; it will not be shown again. Put it in
              ~/.config/applyengine/prep-review.env as PREP_REVIEW_TOKEN.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-[var(--panel-2)] px-2 py-1.5 text-xs">
                {token.token}
              </code>
              <Button size="sm" variant="outline" onClick={copyToken}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)]">
            {token?.exists
              ? `Created ${when(token.created_at)} · last used ${when(token.last_used_at)}`
              : "No token yet."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={issueToken} disabled={busy}>
            {token?.exists ? "Replace token" : "Create token"}
          </Button>
          {token?.exists && (
            <Button size="sm" variant="ghost" onClick={revokeToken} disabled={busy}>
              Revoke
            </Button>
          )}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Daily log</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Download the JSON the review reads: planned tasks, attempts with code and notes,
          streak, redos and weekly totals.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="log-date">Day</Label>
            <Input
              id="log-date"
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" onClick={exportLog} disabled={busy || !logDate || !settings?.configured}>
            Download log
          </Button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          To re-run the review for that day, run this in the repo:
        </p>
        <code className="block rounded bg-[var(--panel-2)] px-2 py-1.5 text-xs">
          scripts/prep_daily_review.sh {logDate}
        </code>
      </Card>
    </div>
  );
}
