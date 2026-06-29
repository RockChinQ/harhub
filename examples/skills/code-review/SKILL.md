---
name: code-review
description: Review a pull request or local diff for correctness, regressions, and missing validation.
---

# Code Review

Use this skill when an agent needs to review a code change and return actionable findings before implementation details or praise.

## Procedure

1. Identify the changed files and the intended behavior.
2. Prioritize bugs, regressions, data loss, security risks, and missing tests.
3. Ground every finding in a file path and line number when possible.
4. Keep summaries brief and place them after findings.
5. If there are no findings, state that clearly and mention residual test risk.

## Validation

- Findings are ordered by severity.
- Each finding explains the concrete user or system impact.
- Non-actionable style preferences are omitted unless they hide a real defect.
