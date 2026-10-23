"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { CaseTranscriptAnalysis } from "@/lib/types";
import { Button } from "@/components/ui";
import { CaseScorecard } from "./case-scorecard";

/** Score a transcript from a mock case done elsewhere (with a friend, a recording, etc.). */
export function CaseTranscriptAnalyzer({ caseId }: { caseId: string }) {
  const [transcript, setTranscript] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CaseTranscriptAnalysis | null>(null);

  async function analyze() {
    if (!transcript.trim()) return;
    setBusy(true);
    setError("");
    try {
      const mins = Number(minutes);
      const data = await api.analyzeCaseTranscript({
        case_id: caseId,
        transcript,
        duration_seconds: minutes && mins > 0 ? mins * 60 : null,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyse the transcript.");
    } finally {
      setBusy(false);
    }
  }

  const delivery = result?.delivery;
  const fillers = delivery
    ? Object.entries(delivery.filler_breakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : [];

  return (
    <details className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--panel-2)]/40">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--text-secondary)]">
        Score a transcript of this case instead
        <span className="ml-2 text-xs font-normal text-[var(--muted)]">
          Paste a mock you did elsewhere; label lines “Interviewer:” and “Me:” if you can
        </span>
      </summary>
      <div className="space-y-3 border-t border-[var(--border)] p-4">
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={8}
          placeholder={"[00:00] Interviewer: …\n[00:12] Me: Before I start, could I ask what the main KPI is?"}
          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel)] p-3 text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            Speaking time (min, optional)
            <input
              type="number"
              min={0}
              step={0.5}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-20 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-sm"
            />
          </label>
          <Button size="sm" onClick={() => void analyze()} disabled={busy || !transcript.trim()}>
            {busy ? "Scoring…" : "Score transcript"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        {result && delivery && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--muted)]">
              {result.candidate_word_count} words from you
              {result.interviewer_lines ? ` · ${result.interviewer_lines} interviewer lines ignored` : ""} ·{" "}
              {result.duration_source === "none"
                ? "pace not measured (add timestamps or speaking time)"
                : `${delivery.words_per_minute} wpm (${result.duration_source})`}{" "}
              · {delivery.filler_rate_per_100} fillers per 100 words
              {fillers.length ? ` (${fillers.map(([w, c]) => `${w} ×${c}`).join(", ")})` : ""}
            </p>
            <CaseScorecard card={result.case_scorecard} />
          </div>
        )}
      </div>
    </details>
  );
}
