# ApplyEngine — Interview Prep module (spec for Claude Code)

> **How to use:** copy `PREP_MODULE_SPEC.md` and `prep_seed.json` into the root of the ApplyEngine repo, open Claude Code there, and paste:
>
> *"Read PREP_MODULE_SPEC.md and prep_seed.json. First explore this repo and tell me its stack, routing, styling, data layer and existing shared components. Then propose a plan that fits those conventions. Don't write code until I approve the plan. Build it phase by phase, running tests after each one."*

## 1. Goal

Add an **Interview Prep** section to ApplyEngine that drives a 10-week Applied AI prep program every day. It should:

- show today's tasks as a checklist that motivates daily use (streak, progress, redo queue)
- link each DSA task to LeetCode
- give a built-in code editor for drills and LLD, with **AI assistance off**
- log every attempt (time, hints, result, code, notes)
- produce one daily log file that an automated Claude review turns into written feedback, which shows in the app the next morning

The program content lives in `prep_seed.json` (109 tasks). The full plan is at the `doc_url` in that file.

## 2. Fit the existing app

- Use ApplyEngine's existing stack, router, styling system, state management and DB/ORM. **Don't add a new framework.**
- Put reusable UI under the app's shared components folder. Put prep-specific code under a `prep` feature folder (or whatever the repo's convention is).
- Add an "Interview Prep" item to the existing navigation.

## 3. Reusable components

These must be generic and prop-driven, with no prep-specific logic inside, so other ApplyEngine sections can reuse them.

| Component | Purpose | Key props |
| --- | --- | --- |
| `CodeEditor` | Monaco editor (`@monaco-editor/react`), Python default. **Inline suggestions, quick suggestions, and any AI/copilot integration disabled.** Autosaves a draft every 5 s | `value`, `onChange`, `language`, `readOnly` |
| `CodeRunner` | Runs Python in the browser via Pyodide (lazy-loaded) and shows stdout/stderr and test results | `code`, `tests?` |
| `Timer` | Count-up timer with a target; turns amber at 80% of target and red past it; pause/resume | `targetMinutes`, `onStop(elapsed)` |
| `Checklist` | List of items with checkboxes, optional sublabel, link and badge | `items`, `onToggle` |
| `TaskCard` | Title, type badge, target time, external link, status, "Start" button | `task`, `status`, `onStart` |
| `StreakBadge` | Current and best streak in days | `current`, `best` |
| `ProgressRing` | % complete for a week or program | `value`, `label` |
| `WeekStrip` | 7-day row showing done / partial / missed per day | `days` |
| `MarkdownPanel` | Renders markdown (for the feedback) | `markdown` |
| `RatingInput` | 1–5 self-rating | `value`, `onChange` |

## 4. Data model

Load the seed into tables (or collections) on first run. The import must be idempotent, keyed on `task.id`.

- **Task**: fields from the seed (`id`, `type` ∈ dsa | drill | lld | hld | python | project, `week`, `day?`, `slot` ∈ morning | evening | weekend, `title`, `url?`, `spec?`, `extensions?`, `framework?`, `target_minutes`, `stretch?`, `editor?`).
- **ProgramSettings**: `start_date` (user picks it; Monday of week 1), `hours_per_week`.
- **Attempt**: `id`, `task_id`, `date`, `started_at`, `ended_at`, `elapsed_minutes`, `hint_used` (bool), `solved` (yes | partial | no), `self_rating` 1–5, `code` (text), `notes` (text: what blocked you, pattern used), `complexity` (text, e.g. "O(n) time, O(n) space").
- **Redo**: `task_id`, `due_date`, `reason`, `done`. Created automatically when an attempt has `hint_used`, `elapsed > target`, or `solved != yes`. Create two redos, at +3 and +7 days (`rules.redo_offsets_days`).
- **DailyFeedback**: `date`, `markdown`, `created_at`.

## 5. Scheduling logic: "what's today?"

- `week = floor((today - start_date) / 7) + 1`, capped at 10.
- **Morning (DSA):** the next 2 unfinished `dsa` tasks for this week, in `order`. If the week's DSA is done, use due redos. In weeks 9–10, show "1 unseen medium from NeetCode 150" (link https://neetcode.io/practice) plus due redos.
- **Evening:**
  - Week 1: the `python` task for today's weekday.
  - Weeks 2–3: the next `drill`.
  - Weeks 4–6: an `lld` task on Mon/Wed/Fri and an `hld` task on Tue/Thu (match `day`).
  - Weeks 7–8: the `hld` tasks for that week, plus one drill redo.
- **Weekend:** the `project` milestones for this week.
- **Always:** redos due today or overdue, shown at the top with a "Redo" badge.
- Unfinished tasks roll forward. Never silently drop a task.

## 6. Screens

1. **Today (default)**
   - Header: week N of 10, `StreakBadge`, today's `ProgressRing`, `WeekStrip`.
   - Morning, evening and redo checklists of `TaskCard`s.
   - **Yesterday's feedback** in a `MarkdownPanel` at the top, collapsible.
   - Motivation: a streak counts a day if ≥ 2 tasks are completed. Show "X of Y done today" and a single line such as "2 more to keep your 6-day streak". Keep the tone plain, no confetti spam.
2. **Work session** (opens from "Start")
   - **DSA:** an "Open on LeetCode" button (new tab), the `Timer`, and a `CodeEditor` to paste the final solution. The rules from the plan show in a side panel: restate → brute force → optimise → code → trace.
   - **Drill / LLD / Python:** spec and extensions shown above the `CodeEditor`, plus `CodeRunner` and `Timer`.
   - **HLD:** `framework` steps as a timed checklist, a notes textarea, and a link to excalidraw.com.
   - **Finish form:** solved, hint used, self-rating, complexity, notes → saves an Attempt, creates Redos if needed, ticks the checklist.
   - The "Hint used" toggle must be prominent. Honest logging is the point.
3. **Plan:** all 10 weeks with every task and its status, filterable by type.
4. **Feedback history:** a list of DailyFeedback entries, newest first.
5. **Settings:** start date, and a button to export or re-run the daily log.

## 7. Daily feedback loop

**Export.** At 21:00 local time (and on demand), write `prep_data/logs/YYYY-MM-DD.json` containing:

- the day's planned tasks and which were done
- every Attempt from today, including code and notes
- the current streak, due/overdue redos, and week number
- totals: tasks done this week vs planned

Use a server route or script. Put `prep_data/` in `.gitignore`.

**Review.** Add `scripts/prep_daily_review.sh`, which runs Claude Code headless on that file:

```bash
#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
DAY=$(date +%F)
LOG="prep_data/logs/$DAY.json"
[ -f "$LOG" ] || exit 0
mkdir -p prep_data/feedback
claude -p "You are a strict but encouraging interview coach for Applied AI roles. Read $LOG. Write markdown with: 1) a one-line verdict on today; 2) for each attempt, a code review (correctness, complexity, edge cases, Python style, one concrete improvement) — judge the code I wrote, do not rewrite it in full; 3) patterns I am weak on, from hints and overtime; 4) whether I am on pace for this week; 5) tomorrow's top 3 priorities. Under 400 words." \
  --allowedTools "Read" > "prep_data/feedback/$DAY.md"
```

**Ingest.** The app reads `prep_data/feedback/*.md` into DailyFeedback, either on load or with a file watcher. Show it on the next day's Today screen.

**Schedule on macOS.** Create `scripts/com.applyengine.prepreview.plist` (a launchd agent, daily at 21:30) that runs the script. Include install instructions in the README: `cp` the plist to `~/Library/LaunchAgents/`, then `launchctl load`.

## 8. Build phases (stop for review after each)

1. Seed import, data model, Today screen with checklist, streak and LeetCode links.
2. Work session: Timer, CodeEditor (AI off), finish form, attempts and redos.
3. CodeRunner (Pyodide), Plan screen, Feedback history.
4. Daily export, review script, launchd plist, feedback ingest.

## 9. Acceptance checks

- With `start_date` = today, the Today screen shows "Two Sum" and "Contains Duplicate" (morning) and "Python: Built-in collections" (evening, if today is a Monday).
- Finishing an attempt with "hint used" creates 2 redos at +3 and +7 days. They appear on those dates.
- The editor shows no inline completions. Check the Monaco options: `inlineSuggest.enabled: false`, `quickSuggestions: false`, `suggestOnTriggerCharacters: false`.
- Running the review script on a sample log produces a feedback `.md`, and it renders on Today.
- Re-importing the seed creates no duplicates.
- Unit tests cover the scheduling logic (section 5) and redo creation.
