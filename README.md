# Harhub

Harhub is a workspace for managing reusable Agent Skills.

It helps teams upload, validate, preview, and organize Skill packages so coding
agents can use a shared set of team-approved capabilities instead of scattered
local files.

Harhub currently focuses on Agent Skills as the first supported asset type.
MCPs, rules, and other agent assets are planned, but the current product surface
is intentionally Skills-first.

## What You Can Do

- Upload Skill zip packages.
- Validate packages against the Agent Skills `SKILL.md` format.
- Search and browse Skills in a workspace.
- Preview Skill metadata and package files.
- Manage Skills from the web UI or CLI.
- Run Harhub locally with S3-compatible object storage and optional Postgres
  persistence.

## Agent Skills

Harhub manages the open Agent Skills format documented at
[agentskills.io](https://agentskills.io/specification.md). A Skill package is a
directory or zip containing `SKILL.md`.

```text
code-review/
  SKILL.md
  references/
  scripts/
  assets/
```

Harhub does not define a competing Skill format. It stores package files and the
runtime state needed to manage them in a workspace.

## Quick Start

```bash
npm install
npm run build
npm run start
```

Then open:

```text
http://127.0.0.1:5176/skills
```

Demo account:

```text
admin@harhub.local
harhub
```

For local development:

```bash
npm run dev
```

Fixed local ports:

- Web: `http://127.0.0.1:5176`
- API: `http://127.0.0.1:3310`

To start the local cloud-style stack with object storage:

```bash
npm run dev:cloud
```

## CLI

Install the CLI from a checkout:

```bash
npm install
npm run build
npm install -g .
```

Configure your Harhub target:

```bash
export HARHUB_URL=http://127.0.0.1:3310
export HARHUB_WORKSPACE_ID=ws_demo
export HARHUB_TOKEN=<access-token>
```

Scan the current directory and choose which discovered Skills to upload:

```bash
harhub skills upload
```

Scan a specific directory:

```bash
harhub skills upload /path/to/repo
```

Upload every valid discovered Skill without the selector:

```bash
harhub skills upload /path/to/repo --all
```

Useful commands:

```bash
harhub assets list
harhub assets show <id|name|slug>
harhub skills scan [paths...]
harhub skills validate [paths...]
harhub skills upload [paths...]
```

## Configuration

Skill uploads require S3-compatible object storage:

```bash
export HARHUB_S3_BUCKET=harhub-assets
export HARHUB_S3_REGION=us-east-1
export HARHUB_S3_ENDPOINT=http://127.0.0.1:9000
export HARHUB_S3_FORCE_PATH_STYLE=true
```

For persistent hosted or local deployments, configure Postgres:

```bash
export HARHUB_DATABASE_URL=postgres://user:password@host:5432/harhub
```

Without Postgres, Harhub falls back to local development state under `.harhub/`.

## Learn More

Detailed documentation lives in [`docs/`](./docs/).

For Skill package details, see [`docs/06-skill-standard.md`](./docs/06-skill-standard.md).
