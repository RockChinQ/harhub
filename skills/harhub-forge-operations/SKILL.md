---
name: harhub-forge-operations
description: Run Harhub Forge sessions through adaptive project discovery, follow-up answers, workspace Skill selection, framework generation, archive download, and Project freezing. Use when turning a product or engineering requirement into a reusable harness framework.
---

# Harhub Forge Operations

Forge is a persistent, URL-addressable workflow. The server owns session state; always re-read the session instead of reconstructing state from conversation memory.

## Start Or Resume

1. Use `harhub_forge_sessions_list` when the user may already have a relevant session.
2. Resume with `harhub_forge_session_get`, or create one with `harhub_forge_session_create`.
3. Base every next action on the returned session status and current unanswered questions.

## Adaptive Discovery

Use `harhub_forge_follow_up` to submit answers and request the next discovery step.

- Prefer concise answers, selected options, constraints, and examples over asking the user for an essay.
- Do not assume a fixed question count. Sparse initial requirements normally need broader follow-up; detailed requirements may be ready sooner.
- Preserve the question text in each `{ question, answer }` object.
- Ask the most essential product questions first: outcome, user, problem, scope, constraints, and success evidence.
- Continue until generation is allowed or the user explicitly chooses to generate at the permitted threshold.

## Generate And Finish

1. Call `harhub_forge_generate`, including any final answers the user wants submitted.
2. The tool consumes the full server stream and returns events plus composed text. If it fails or times out, call `harhub_forge_session_get` before retrying; the session is reentrant.
3. Download with `harhub_forge_archive_download`, or persist it with `harhub_forge_session_freeze`.
4. Delete only when explicitly requested; deleting a session does not delete an already frozen Project.

Read [references/tools.md](references/tools.md) for exact inputs and recovery rules.
