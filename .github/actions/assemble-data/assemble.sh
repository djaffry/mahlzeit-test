#!/usr/bin/env bash
set -euo pipefail

# Inputs:
#   REPO_ROOT   — absolute path to the main checkout (contains data/config.json)
#   DIST_DIR    — absolute path to the dist/ directory that the Pages artifact uploads
# Behaviour:
#   Reads timezone + archiveWeeks from data/config.json.
#   Computes current ISO week in that timezone, fetches data-YYYY-Www from origin, copies into DIST_DIR/data.
#   Fetches the preceding archiveWeeks weeks, copies into DIST_DIR/archive/<week>/.
#   Writes DIST_DIR/archive/index.json listing weeks actually copied.
#   Fails if the current-week branch does not exist, or if git fetch fails outright.

REPO_ROOT="${REPO_ROOT:-$PWD}"
DIST_DIR="${DIST_DIR:-$REPO_ROOT/dist}"

cd "$REPO_ROOT"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

CONFIG_PATH="data/config.json"
TZ_NAME=$(jq -r '.timezone' "$CONFIG_PATH")
ARCHIVE_WEEKS=$(jq -r '.archiveWeeks' "$CONFIG_PATH")
if [[ -z "${TZ_NAME:-}" || "$TZ_NAME" == "null" ]]; then
  echo "::error::$CONFIG_PATH missing .timezone"; exit 1
fi
if [[ -z "${ARCHIVE_WEEKS:-}" || "$ARCHIVE_WEEKS" == "null" ]] \
  || ! [[ "$ARCHIVE_WEEKS" =~ ^[0-9]+$ ]]; then
  echo "::error::$CONFIG_PATH .archiveWeeks must be a non-negative integer"; exit 1
fi

export TZ="$TZ_NAME"

TODAY=$(date +%Y-%m-%d)
YEAR=$(date -d "$TODAY" +%G)
WEEK=$(date -d "$TODAY" +%V)
CURRENT_WEEK="${YEAR}-W${WEEK}"

weeks_to_fetch=("$CURRENT_WEEK")
for ((i = 1; i <= ARCHIVE_WEEKS; i++)); do
  D=$(date -d "$TODAY -$((i * 7)) days" +%Y-%m-%d)
  Y=$(date -d "$D" +%G)
  W=$(date -d "$D" +%V)
  weeks_to_fetch+=("${Y}-W${W}")
done

# Batched fetch: one git call with all candidate refspecs. Missing branches make
# the whole call exit non-zero, which we can't distinguish from a real fetch
# failure (auth, network). So if the batched fetch fails, fall back to fetching
# each ref individually — that lets us tell "ref doesn't exist" (OK, skip) from
# "fetch itself broke" (fail loudly) per-branch.
refspecs=()
for week in "${weeks_to_fetch[@]}"; do
  refspecs+=("data-${week}:refs/remotes/origin/data-${week}")
done

fetch_err=""
if ! git fetch --no-tags origin "${refspecs[@]}" 2>"$tmp/fetch-err.log"; then
  fetch_err=$(cat "$tmp/fetch-err.log" || true)
  for week in "${weeks_to_fetch[@]}"; do
    refspec="data-${week}:refs/remotes/origin/data-${week}"
    if git fetch --no-tags origin "$refspec" 2>"$tmp/fetch-err-one.log"; then
      continue
    fi
    one_err=$(cat "$tmp/fetch-err-one.log" || true)
    # "couldn't find remote ref" is git's benign "branch doesn't exist" signal;
    # anything else means fetch itself broke (auth/network) and must fail loudly.
    if ! grep -q "couldn't find remote ref" "$tmp/fetch-err-one.log" 2>/dev/null; then
      echo "::error::git fetch failed for data-${week}: ${one_err:-no details}"
      echo "::error::initial batch fetch stderr: ${fetch_err}"
      exit 1
    fi
  done
fi

existing_weeks=()
for week in "${weeks_to_fetch[@]}"; do
  if git rev-parse --verify --quiet "refs/remotes/origin/data-${week}" >/dev/null; then
    existing_weeks+=("$week")
  else
    echo "::notice::branch data-${week} does not exist (skipping)"
  fi
done

echo "::notice::found ${#existing_weeks[@]} of ${#weeks_to_fetch[@]} candidate branches: ${existing_weeks[*]:-none}"

current_present=0
for week in "${existing_weeks[@]}"; do
  [[ "$week" == "$CURRENT_WEEK" ]] && { current_present=1; break; }
done
if [[ $current_present -eq 0 ]]; then
  echo "::error::current-week branch data-${CURRENT_WEEK} not found; cannot assemble deploy."
  echo "::error::To bootstrap: locally run 'cd scraper && npm run build && PECKISH_DATA_DIR=\$PWD/.week PECKISH_GLOBALS_DIR=\$PWD/../data node dist/scrape-runner.js' from a worktree on the branch, commit to data-${CURRENT_WEEK}, and push. Then re-run this workflow."
  exit 1
fi

rm -rf "$DIST_DIR/data/de" "$DIST_DIR/data/en" "$DIST_DIR/archive"
mkdir -p "$DIST_DIR/archive"

# git archive | tar extracts without touching the index (unlike `git checkout`).
# de/ or en/ may be absent on a given week — try both together first, fall back
# per-path so one missing side doesn't lose the other.
copy_week() {
  local week="$1" target="$2"
  mkdir -p "$target"
  git archive "origin/data-${week}" de en 2>/dev/null | tar -x -C "$target" || {
    git archive "origin/data-${week}" de 2>/dev/null | tar -x -C "$target" || true
    git archive "origin/data-${week}" en 2>/dev/null | tar -x -C "$target" || true
  }
}

copy_week "$CURRENT_WEEK" "$DIST_DIR/data"

archive_weeks=()
for week in "${existing_weeks[@]}"; do
  if [[ "$week" == "$CURRENT_WEEK" ]]; then continue; fi
  copy_week "$week" "$DIST_DIR/archive/${week}"
  archive_weeks+=("$week")
done

if [[ ${#archive_weeks[@]} -eq 0 ]]; then
  echo '{"weeks":[]}' > "$DIST_DIR/archive/index.json"
else
  printf '%s\n' "${archive_weeks[@]}" | sort -r | jq -R . | jq -s '{ weeks: . }' > "$DIST_DIR/archive/index.json"
fi

echo "assembled: current=$CURRENT_WEEK, archive=[${archive_weeks[*]:-none}]"
