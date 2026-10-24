#!/bin/bash
# Nightly Interview Prep review.
#
# Fetches the day's log from the ApplyEngine API, has Claude Code review it,
# and uploads the feedback so it shows on the next morning's Today screen.
#
# Usage: scripts/prep_daily_review.sh [YYYY-MM-DD]   (default: today)
# Config: ~/.config/applyengine/prep-review.env (see README, "Interview Prep").
set -euo pipefail
cd "$(dirname "$0")/.." || exit 1

CONFIG="${PREP_REVIEW_CONFIG:-$HOME/.config/applyengine/prep-review.env}"
# shellcheck source=/dev/null
[ -f "$CONFIG" ] && . "$CONFIG"
: "${PREP_API_URL:?Set PREP_API_URL in $CONFIG}"
: "${PREP_REVIEW_TOKEN:?Set PREP_REVIEW_TOKEN in $CONFIG}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
# launchd starts with a bare PATH; make claude's own directory (and its node) findable.
case "$CLAUDE_BIN" in
  /*) export PATH="$(dirname "$CLAUDE_BIN"):$PATH" ;;
esac
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

DAY="${1:-$(date +%F)}"
LOG="prep_data/logs/$DAY.json"
OUT="prep_data/feedback/$DAY.md"
mkdir -p prep_data/logs prep_data/feedback

# Keep the token off the command line, where other processes could read it.
HEADERS="$(mktemp)"
REVIEW="$(mktemp)"
trap 'rm -f "$HEADERS" "$REVIEW" "$LOG.tmp"' EXIT
chmod 600 "$HEADERS"
printf 'Authorization: Bearer %s\n' "$PREP_REVIEW_TOKEN" > "$HEADERS"

echo "[$(date '+%F %T')] Fetching log for $DAY"
# A sleeping free-tier API can take a minute to wake, hence the retries.
curl -fsS --max-time 120 --retry 3 --retry-delay 20 --retry-all-errors \
  -H @"$HEADERS" "$PREP_API_URL/api/prep/log?date=$DAY" -o "$LOG.tmp"
mv "$LOG.tmp" "$LOG"

if grep -q '"status":"not_started"' "$LOG"; then
  echo "Program has not started yet; nothing to review."
  exit 0
fi

echo "[$(date '+%F %T')] Reviewing with Claude Code"
"$CLAUDE_BIN" -p "You are a strict but encouraging interview coach for Applied AI roles. Read $LOG. Write markdown with: 1) a one-line verdict on today; 2) for each attempt, a code review (correctness, complexity, edge cases, Python style, one concrete improvement) — judge the code I wrote, do not rewrite it in full; 3) patterns I am weak on, from hints and overtime; 4) whether I am on pace for this week; 5) tomorrow's top 3 priorities. Under 400 words." \
  --allowedTools "Read" > "$REVIEW"

if [ ! -s "$REVIEW" ]; then
  echo "Claude returned no review; not uploading." >&2
  exit 1
fi
mv "$REVIEW" "$OUT"

echo "[$(date '+%F %T')] Uploading feedback"
curl -fsS --max-time 120 --retry 3 --retry-delay 20 --retry-all-errors \
  -X PUT -H @"$HEADERS" -H "Content-Type: text/markdown; charset=utf-8" \
  --data-binary @"$OUT" "$PREP_API_URL/api/prep/feedback/$DAY" > /dev/null
echo "[$(date '+%F %T')] Feedback for $DAY saved to $OUT and uploaded"
