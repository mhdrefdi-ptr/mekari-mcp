#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PROMPT_FILE="${PROMPT_FILE:-ralph/prompt.md}"
ISSUE_LIMIT="${ISSUE_LIMIT:-20}"

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

require_cmd git
require_cmd gh
require_cmd codex

if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "Prompt file not found: $PROMPT_FILE" >&2
    exit 1
fi

gh auth status >/dev/null

issues="$(
    gh issue list \
        --state open \
        --limit "$ISSUE_LIMIT" \
        --json number,title,body,url,labels \
        --jq '
            if length == 0 then
                "No open GitHub issues found"
            else
                [.[] |
                    "#\(.number) \(.title)\nURL: \(.url)\nLabels: \([.labels[].name] | join(", "))\n\n\(.body // "")"
                ] | join("\n\n---\n\n")
            end
        ' 2>/dev/null || echo "No GitHub issues found"
)"

commits="$(
    git log -n 5 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo "No commits found"
)"

{
    printf 'Previous commits:\n%s\n\n' "$commits"
    printf 'GitHub issues:\n%s\n\n' "$issues"
    cat "$PROMPT_FILE"
} | codex exec --cd "$ROOT" -
