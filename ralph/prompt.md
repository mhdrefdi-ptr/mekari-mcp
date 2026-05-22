# ISSUES

GitHub issues are provided at the start of context. Parse them to understand the open issues.

You will work on AFK-ready issues only. In this repo, AFK-ready means the issue has the `ready-for-agent` label.

Do not work on HITL issues. Treat these labels as HITL or not-AFK:

- `ready-for-human`
- `needs-info`
- `needs-triage`
- `wontfix`

You've also been passed the last few commits. Review these to understand what work has been done.

If all AFK tasks are complete, output `<promise>NO MORE TASKS</promise>`.

# TASK SELECTION

Pick the next task. Prioritize tasks in this order:

1. Critical bugfixes
2. Development infrastructure

Getting development infrastructure like tests, local scripts, and build tooling ready is an important precursor to building features.

3. Tracer bullets for new features

Tracer bullets are small slices of functionality that go through all layers of the system, allowing you to test and validate your approach early. This helps identify potential issues and ensures the overall architecture is sound before investing significant time in development.

TL;DR - build a tiny, end-to-end slice of the feature first, then expand it out.

4. Polish and quick wins
5. Refactors

# EXPLORATION

Explore the repo.

Read the selected GitHub issue with:

```bash
gh issue view <number> --comments
```

If the issue references a parent PRD or another issue, fetch and read that issue before editing.

# IMPLEMENTATION

Use the `tdd` skill to complete the task.

# FEEDBACK LOOPS

Before committing, run the feedback loops relevant to the change:

- `npm run test` to run test
- `npm run typecheck` to run the type checker

# COMMIT

Make a git commit. The commit message must:

1. Include key decisions made
2. Include files changed
3. Include blockers or notes for next iteration

# THE ISSUE

If the task is complete, update the GitHub issue:

1. Add a comment with the commit hash, summary, tests run, and any follow-up notes.
2. Remove the `ready-for-agent` label.
3. Add the `ready-for-human` label if human review is still needed.
4. Close the issue only if the issue is fully done and no review or follow-up is needed.

If the task is not complete, add a comment to the GitHub issue with what was done, what remains, and the blocker.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.

Do not invent tasks. Only work from the provided GitHub issues.

Do not change dependencies unless the selected issue explicitly requires it.

Do not rewrite unrelated code.
