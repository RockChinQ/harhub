# Harhub

Harhub is a tenant-aware control plane for **team AI harness management**: the Skills, MCP servers, rules, project instructions, and governance metadata that make coding agents useful and safe inside an engineering organization.

The implemented MVP uses **Agent Skills** as the first managed Asset kind: zip uploads are stored in S3/S3-compatible object storage, then indexed for workspace management. This keeps the first product slice narrow while validating the broader opportunity: a cross-tool registry, policy layer, and distribution workflow for team-managed AI harnesses.

The broader product design lives in [`docs/00-overview.md`](./docs/00-overview.md). Rule composition, MCP governance, bundle composition, and PR automation remain outside the current implementation, but they are now explicit expansion paths rather than separate products.

## Skill Standard

Harhub does not define a custom skill format. It manages the open Agent Skills format documented at [agentskills.io](https://agentskills.io/specification.md):

```text
code-review/
  SKILL.md
  references/
  scripts/
  assets/
```

`SKILL.md` must start with YAML frontmatter. `name` and `description` are required; optional fields are the ones defined by the Agent Skills spec (`license`, `compatibility`, `metadata`, and `allowed-tools`).

```yaml
---
name: code-review
description: Review code changes for correctness, regressions, and missing validation.
---
```

Harhub stores only workspace management state around those standard Skills: validation status, object storage references, and preview data.

## Quick Start

```bash
npm install
npm run build
npm run start
```

Then open `http://127.0.0.1:5176/skills`.

Demo account:

```text
admin@harhub.local
harhub
```

For local development with Vite:

```bash
npm run dev
```

- API: `http://127.0.0.1:3310`
- Web: `http://127.0.0.1:5176/skills`

### S3 Storage

Skill uploads require S3-compatible object storage. Configure these environment variables before starting the API:

```bash
export HARHUB_S3_BUCKET=harhub-assets
export HARHUB_S3_REGION=us-east-1
# Optional for MinIO/R2/S3-compatible providers:
export HARHUB_S3_ENDPOINT=http://127.0.0.1:9000
export HARHUB_S3_FORCE_PATH_STYLE=true
export HARHUB_S3_PREFIX=dev
export HARHUB_S3_PUBLIC_BASE_URL=https://assets.example.com
```

The uploaded zip must contain a `SKILL.md` file. Harhub reads that file for the standard Agent Skills fields, stores the zip in S3, and records runtime asset state locally. Local JSON files under `.harhub/` are runtime indexes only; they are not the Skill storage backend.

## Stack

- TypeScript across CLI, API, shared skill logic, and frontend.
- Express API for account, workspace, Assets, S3-backed Skill zip upload, and Skills routes.
- Vite + React frontend.
- shadcn-style UI components under `src/web/src/components/ui`.
- Tailwind CSS with CSS variables and `components.json` for shadcn conventions.

## SaaS Model

The current SaaS MVP is local-first but tenant-aware:

- Accounts sign in with bearer-token sessions.
- Workspaces represent tenants.
- Memberships attach accounts to workspaces with roles.
- Each workspace has its own asset index, members, roles, and Skill upload namespace.
- Workspace asset indexes are stored under `.harhub/workspaces/<workspace-id>/assets.json`; Skill zip bytes live in S3.

The local state file is `.harhub/state.json`, which is ignored by Git.

## Product Direction

Harhub should not be just a Skill file browser. The long-term product is a team control plane for AI harness assets:

- Discover and catalog existing `AGENTS.md`, `.cursor/rules`, Copilot instructions, Agent Skills, MCP definitions, and workflow playbooks.
- Review, validate, approve, version, and roll back harness changes.
- Publish team-approved harness packages to multiple targets such as Codex, Claude Code, Cursor, GitHub Copilot, CI, and repository files.
- Govern MCP/tool access with explicit permissions, ownership, audit logs, and risk labels.

The Skills-only MVP is the first wedge because Skills have a concrete package shape, clear validation rules, and an obvious reuse loop: upload, validate, preview, and install.

## Commands

Install the CLI from a checkout:

```bash
npm install
npm run build
npm install -g .
```

Configure the target Harhub workspace:

```bash
export HARHUB_URL=http://127.0.0.1:3310
export HARHUB_WORKSPACE_ID=ws_demo
export HARHUB_TOKEN=<access-token>
```

Scan the current directory and choose which discovered Agent Skills to upload:

```bash
harhub skills upload
```

You can also scan a specific repository or directory:

```bash
harhub skills upload /path/to/repo
```

In a real terminal, `harhub skills upload` opens a TUI selector. Invalid Skills
are shown but cannot be selected. For scripts or CI, pass `--all` to upload every
valid Skill without the selector:

```bash
harhub skills upload /path/to/repo --all \
  --url http://127.0.0.1:3310 \
  --workspace ws_demo \
  --token "$HARHUB_TOKEN"
```

```bash
npm run cli -- skills upload [paths...] --all --workspace <workspace-id> --token <token> --url <harhub-url>
npm run cli -- assets upload <skill.zip> --workspace <workspace-id> --token <token> --url <harhub-url>
npm run cli -- assets list
npm run cli -- assets show <id|name|slug>
npm run cli -- skills scan [paths...]
npm run cli -- skills validate [paths...]
npm run cli -- skills list
npm run cli -- skills show <id|name|slug>
npm run cli -- skills create <name> [--dir skills]
```

After `npm run build`, the compiled CLI can also be run directly:

```bash
node dist/cli.js skills upload ./examples/skills --all --workspace ws_demo --token "$HARHUB_TOKEN"
node dist/cli.js assets list
```

## Release

Publishing to npm is handled by GitHub Actions when a GitHub Release is
published. The release tag must match `package.json`:

```bash
npm version patch
git push origin main --tags
```

Then create and publish a GitHub Release for that tag. Stable releases publish
to the npm `latest` tag; GitHub prereleases publish to `beta`.

The publish workflow requires a GitHub Actions secret named `NPM_TOKEN`.

## API

```text
GET  /api/health
GET  /api/session
POST /api/auth/login
POST /api/auth/signup
POST /api/auth/logout
GET  /api/workspaces
POST /api/workspaces
PATCH /api/workspaces/:workspaceId
GET  /api/workspaces/:workspaceId/assets
POST /api/workspaces/:workspaceId/assets/upload
PATCH /api/workspaces/:workspaceId/assets/:query
DELETE /api/workspaces/:workspaceId/assets/:query
GET  /api/workspaces/:workspaceId/skills
GET  /api/workspaces/:workspaceId/skills/:query
POST /api/workspaces/:workspaceId/skills/scan
POST /api/workspaces/:workspaceId/skills/validate
POST /api/workspaces/:workspaceId/skills
```

The production server serves the built Vite app from `dist/web` and the API from the same port.

## MVP Boundary

Current boundary:

- Skill zip upload to S3/S3-compatible object storage.
- Standard `SKILL.md` field extraction from uploaded zips.
- Workspace-local JSON asset index for Harhub runtime state.
- Recursive `SKILL.md` discovery by scan for development imports.
- Standard field extraction from `SKILL.md` frontmatter.
- Validation for the official agentskills.io fields and name constraints.
- Human-readable and JSON output modes.
