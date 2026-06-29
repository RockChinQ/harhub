# Harhub

Harhub is a local-first control plane for agent harness assets. This MVP focuses only on **Agent Skills**: discovering, validating, cataloging, listing, showing, and scaffolding standards-compatible `SKILL.md` directories.

The broader product design lives in [`docs/`](./docs/README.md). The implemented MVP intentionally excludes rule composition, MCP governance, hosted SaaS behavior, bundle composition, and PR automation.

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

Then open `http://127.0.0.1:3300`.

For local development with Vite:

```bash
npm run dev
```

- API: `http://127.0.0.1:3300`
- Web: `http://127.0.0.1:5173`

The scan command writes a local catalog to `.harhub/skills.json`.

## Stack

- TypeScript across CLI, API, shared skill logic, and frontend.
- Express API for local Skills management.
- Vite + React frontend.
- shadcn-style UI components under `src/web/src/components/ui`.
- Tailwind CSS with CSS variables and `components.json` for shadcn conventions.

## Commands

```bash
npm run cli -- skills scan [paths...]
npm run cli -- skills validate [paths...]
npm run cli -- skills list [--tag value] [--owner value] [--package value]
npm run cli -- skills show <id|name|slug>
npm run cli -- skills create <name> [--dir skills]
```

After `npm run build`, the compiled CLI can also be run directly:

```bash
node dist/cli.js skills scan examples
node dist/cli.js skills list
```

## API

```text
GET  /api/health
GET  /api/skills
GET  /api/skills/:query
POST /api/skills/scan
POST /api/skills/validate
POST /api/skills
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

This implementation is deliberately file-based:

- `SKILL.md` discovery by recursive scan.
- Standard metadata extraction from `SKILL.md` frontmatter plus Harhub registry metadata from optional `harhub.yaml`.
- Validation for required `name`/`description`, slug naming, description length, local Markdown links, duplicates, and obvious secret patterns.
- A JSON catalog at `.harhub/skills.json`.
- Human-readable and JSON output modes.
