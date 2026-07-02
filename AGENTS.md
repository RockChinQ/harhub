# AGENTS.md

This file is the operating guide for coding agents working in this repository.
Read it before making changes.

## Product Boundary

Harhub is a tenant-aware control plane for agent harness assets. The current MVP
only manages Agent Skills, and Skills are treated as one Asset kind. Keep the
implementation ready for more asset kinds later.

Do not invent a Harhub-only Skill format. Harhub manages the external Agent
Skills contract:

- A Skill is a directory or zip package containing `SKILL.md`.
- `SKILL.md` uses standard YAML frontmatter with `name` and `description`.
- The MVP catalog keeps only the minimal fields needed to manage Skills:
  name, description, validation status, storage, and preview data.
- Uploaded Skills are zip files stored in S3 or S3-compatible object storage.
  Local `.harhub` JSON files are metadata indexes only, not the Skill package
  storage backend.

If a task depends on the latest Agent Skills definition, verify the official
standard before changing validation or package semantics.

## Project Structure

```text
src/
  cli/                 CLI entrypoints, argument parsing, and command handlers.
  features/
    assets/            Asset catalog, upload, update, delete, and metadata logic.
    skills/            Agent Skill discovery, parsing, validation, and creation.
  server/
    routes/            Express route registration by domain.
    services/          Server-side orchestration for assets, skills, uploads.
    utils/             Server helpers.
  shared/              Types shared by CLI, server, and frontend.
  state/               Local-first accounts, sessions, workspaces, memberships.
  storage/             S3/S3-compatible storage integration.
  web/src/
    app/               App state, routing, layout wiring, formatting helpers.
    components/        Shared app components and shadcn UI components.
    hooks/             React hooks.
    lib/api/           Frontend API client modules.
    views/             Page-level screens and asset/skill views.
docs/                  Product, architecture, SaaS MVP, and Skill standard docs.
examples/              Example Skill packages used by local scans.
scripts/               Local developer helpers such as MinIO startup.
```

Runtime state is under `.harhub/` and is ignored by Git. Do not stage local
state, uploaded test packages, `dist/`, or `node_modules/`.

## Runtime And Ports

Ports are fixed:

- API: `http://127.0.0.1:3310`
- Web: `http://127.0.0.1:5176`

Do not casually change these ports. If a task requires changing them, update the
relevant config, docs, and startup instructions together.

Useful commands:

```bash
npm install
npm run dev
npm run dev:minio
npm run check
npm run build
npm run cli -- assets list
npm run cli -- skills validate examples/skills
```

`npm run dev:minio` starts the repo MinIO compose service and then starts both
frontend and backend with the local S3 env vars. The upload flow must be tested
with S3 configured when a change touches upload, preview, delete, or asset
storage behavior.

## Architecture Rules

- Keep TypeScript end to end: CLI, server, shared types, and frontend.
- Preserve workspace tenancy. API routes that mutate or read tenant data should
  be workspace-scoped under `/api/workspaces/:workspaceId/...`.
- Keep legacy `/api/skills` compatibility routes small and demo-workspace-only.
- Prefer shared types from `src/shared` over duplicated request or response
  shapes.
- Keep local JSON persistence behind `src/state` and catalog helpers. Avoid
  ad-hoc file reads or writes from route handlers.
- Keep object storage behavior behind `src/storage` and server services.
- Validation logic for Skills belongs in `src/features/skills`; asset-level
  orchestration belongs in `src/features/assets` or `src/server/services`.
- Make delete paths idempotent where practical, especially when S3 objects are
  already missing.

## Frontend Rules

The frontend is Vite + React + Tailwind + shadcn.

- Use shadcn components from `src/web/src/components/ui`.
- Add missing shadcn components with `npx shadcn@latest add <component>`.
- Do not use browser-native `alert`, `confirm`, or `prompt`.
- Do not introduce business-level raw `<button>`, `<select>`, `<textarea>`, or
  dialog elements when a shadcn component exists.
- Use shadcn `AlertDialog` for destructive confirmations.
- Use shadcn `Dialog`, `Popover`, `DropdownMenu`, `Select`, `Button`,
  `Input`, `Tabs`, `Sidebar`, and related primitives for app UI.
- Sidebar layout should stay aligned with shadcn sidebar patterns. Workspace and
  account controls belong in footer/menu components, not as primary nav entries.
- Keep fixed page chrome fixed and scroll only the intended content areas.
- For tables and dense asset views, prefer responsive columns and compact
  metadata over forcing the whole page to scroll horizontally.
- Do not show implementation details such as S3 bucket names or object keys in
  normal user-facing pages unless the user explicitly asks for diagnostics.

For browser-visible changes, verify in a real browser at `http://127.0.0.1:5176`
when feasible. For upload changes, use a real zip package and the real file
picker if browser automation cannot attach files.

## Skill And Asset UX Rules

- Skills are displayed and managed as Assets.
- The list page should support search and scanning at a glance.
- Upload belongs behind an explicit upload action, not as always-visible bulk
  form chrome.
- Detail pages should be URL-addressable under `/skills/:slug`.
- Detail pages should show useful metadata, validation state, and a file tree
  with preview support.
- Validation issues must be scoped to the selected asset or skill; do not leak
  issues from other assets into a detail or preview panel.
- After deleting an asset from a detail page, navigate back to the asset list.

## Verification

Before finishing code changes, run the checks that match the change:

```bash
npm run check
npm run build
```

Use targeted CLI/API/browser checks for behavior you touched. Examples:

```bash
curl http://127.0.0.1:3310/api/health
npm run cli -- skills validate examples/skills
npm run cli -- assets list
```

If a check cannot be run, say exactly why.

## Git And Commit Messages

Use Conventional Commits for every commit. Format:

```text
<type>(<scope>): <imperative summary>
```

Allowed types:

- `feat`: user-facing feature or new capability
- `fix`: bug fix
- `refactor`: internal code structure change without intended behavior change
- `docs`: documentation-only change
- `test`: tests or test fixtures
- `chore`: tooling, dependency, or maintenance work
- `style`: formatting-only change
- `perf`: performance improvement

Use scopes that match the touched surface, for example:

- `assets`
- `skills`
- `api`
- `cli`
- `web`
- `sidebar`
- `auth`
- `workspace`
- `storage`
- `docs`

Good examples:

```text
feat(assets): add zip upload validation
fix(web): replace native delete confirmation
refactor(api): split asset response helpers
docs(agents): document project workflow
chore(deps): add shadcn alert dialog
```

Bad examples:

```text
Complete skill asset CRUD
Use shadcn dialogs for confirmations
push
update stuff
fix bugs
```

Commit summary rules:

- Use imperative mood: `add`, `fix`, `replace`, `document`.
- Keep the subject under 72 characters.
- Be specific about the affected surface.
- Do not use vague verbs such as `complete`, `update`, `change`, or `improve`
  unless the scope and object make the behavior clear.
- If a commit mixes multiple meaningful surfaces, split the commit or use the
  most user-visible scope.
- Mention verification in the final response, not in the commit subject.

When pushing, verify the branch is not behind the remote first:

```bash
git fetch origin
git rev-list --left-right --count HEAD...origin/main
```

Do not rewrite shared history unless the user explicitly asks for it.
