# Harhub

Harhub is a tenant-aware control plane for **team AI harness management**: the Skills, MCP servers, rules, project instructions, and governance metadata that make coding agents useful and safe inside an engineering organization.

The implemented MVP uses **Agent Skills** as the first managed Asset kind: zip uploads are stored in S3/S3-compatible object storage, then indexed for workspace management. This keeps the first product slice narrow while validating the broader opportunity: a cross-tool registry, policy layer, and distribution workflow for team-managed AI harnesses.

The broader product design lives in [`docs/00-overview.md`](./docs/00-overview.md). Rule composition, MCP governance, bundle composition, and PR automation remain outside the current implementation, but they are now explicit expansion paths rather than separate products.

## Skill Standard

Harhub does not define a custom skill format. It manages the open Agent Skills format used by Codex and Claude:

```text
code-review/
  SKILL.md
  references/
  scripts/
  assets/
```

`SKILL.md` must start with YAML frontmatter containing only the standard launch metadata:

```yaml
---
name: code-review
description: Review code changes for correctness, regressions, and missing validation.
---
```

Harhub registry metadata such as owner, tags, lifecycle state, and package membership belongs in `harhub.yaml`, not in `SKILL.md` frontmatter.

## Quick Start

```bash
npm install
npm run build
npm run start
```

Then open `http://127.0.0.1:3310/skills`.

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

The uploaded zip must contain a `SKILL.md` file. Harhub reads that file for name and description, stores the zip in S3, and records the S3 bucket/key in the asset index. Local JSON files under `.harhub/` are metadata indexes only; they are not the Skill storage backend.

## Stack

- TypeScript across CLI, API, shared skill logic, and frontend.
- Express API for account, workspace, Assets, S3-backed Skill zip upload, and Skills compatibility routes.
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

```bash
npm run cli -- assets upload <skill.zip> --workspace <workspace-id> --token <token>
npm run cli -- assets list
npm run cli -- assets show <id|name|slug>
npm run cli -- skills scan [paths...]
npm run cli -- skills validate [paths...]
npm run cli -- skills list [--tag value] [--owner value] [--package value]
npm run cli -- skills show <id|name|slug>
npm run cli -- skills create <name> [--dir skills]
```

After `npm run build`, the compiled CLI can also be run directly:

```bash
node dist/cli.js assets upload ./code-review.zip --workspace ws_demo --token "$HARHUB_TOKEN"
node dist/cli.js assets list
```

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

## Skill Package Shape

A skill package can be plain directories containing `SKILL.md`, or it can include a `harhub.yaml` manifest for package metadata.

```text
skills/
  harhub.yaml
  code-review/
    SKILL.md
    references/
```

Minimal manifest:

```yaml
apiVersion: harhub.io/v1
kind: HarnessPackage
metadata:
  name: engineering-skills
  owner: platform
  tags: [engineering]
spec:
  maturity: experimental
  compatibility:
    agents: [codex]
  artifacts:
    - type: skill
      path: code-review/SKILL.md
```

## MVP Boundary

Current boundary:

- Skill zip upload to S3/S3-compatible object storage.
- `SKILL.md` metadata extraction from uploaded zips.
- Workspace-local JSON asset index for MVP metadata.
- Compatibility `SKILL.md` discovery by recursive scan for development imports.
- Standard metadata extraction from `SKILL.md` frontmatter plus Harhub registry metadata from optional `harhub.yaml`.
- Validation for required `name`/`description`, slug naming, description length, local Markdown links, duplicates, and obvious secret patterns.
- Human-readable and JSON output modes.
