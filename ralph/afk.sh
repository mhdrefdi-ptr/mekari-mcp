#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ -z "${1:-}" ]]; then
    echo "Usage: $0 <iterations>" >&2
    exit 1
fi

PROMPT_FILE="${PROMPT_FILE:-ralph/prompt.md}"
ISSUE_LIMIT="${ISSUE_LIMIT:-20}"
CODEX_SANDBOX="${CODEX_SANDBOX:-danger-full-access}"
COMPLETION_PROMISE="${COMPLETION_PROMISE:-<promise>NO MORE TASKS</promise>}"

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

github_issues() {
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
}

recent_commits() {
    git log -n 5 --format='%H%n%ad%n%B---' --date=short 2>/dev/null || echo "No commits found"
}

require_cmd git
require_cmd gh
require_cmd codex

if [[ ! "$1" =~ ^[0-9]+$ || "$1" -lt 1 ]]; then
    echo "Iterations must be a positive integer." >&2
    exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "Prompt file not found: $PROMPT_FILE" >&2
    exit 1
fi

gh auth status >/dev/null

for ((i = 1; i <= "$1"; i++)); do
    output_file="$(mktemp)"
    result_file="$(mktemp)"

    cleanup_iteration() {
        rm -f "$output_file" "$result_file"
    }

    trap cleanup_iteration EXIT

    commits="$(recent_commits)"
    issues="$(github_issues)"

    {
        printf 'Previous commits:\n%s\n\n' "$commits"
        printf 'GitHub issues:\n%s\n\n' "$issues"
        printf 'Runner instruction: when there are no more tasks to do, include exactly `%s` in your final answer.\n\n' "$COMPLETION_PROMISE"
        cat "$PROMPT_FILE"
    } | codex exec \
        --cd "$ROOT" \
        --sandbox "$CODEX_SANDBOX" \
        --output-last-message "$result_file" \
        - >"$output_file"

    result="$(cat "$result_file" 2>/dev/null || true)"

    if [[ "$result" == *"$COMPLETION_PROMISE"* ]]; then
        echo "AFK complete after $i iteration(s)."
        cleanup_iteration
        trap - EXIT
        exit 0
    fi

    cleanup_iteration
    trap - EXIT
done
