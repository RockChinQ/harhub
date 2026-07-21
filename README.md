<div align="center">
  <img src="./docs/public/harhub-icon.svg" alt="Harhub" width="96" height="96" />
  <h1>Harhub</h1>
  <p><strong>Asset control for agent teams.</strong></p>
  <p>
    Upload, validate, preview, and govern reusable Agent Skills from one workspace.
  </p>
  <p>
    <a href="https://harhub.rcpd.cc">Hosted Demo</a>
    ·
    <a href="./docs/guide/getting-started.md">Docs</a>
    ·
    <a href="https://www.npmjs.com/package/harhub">npm</a>
    ·
    <a href="https://github.com/RockChinQ/harhub">GitHub</a>
  </p>
</div>

![Harhub abstract city marketing illustration](./docs/public/harhub-social-preview.png)

## Overview

Harhub is a workspace for managing reusable Agent Skills.

It helps teams upload, validate, preview, and organize Skill packages so coding
agents can use a shared set of workspace-managed capabilities instead of
scattered local files.

Harhub currently focuses on Agent Skills as the first supported asset type.
MCPs, rules, and other agent assets are planned, but the current product surface
is intentionally Skills-first.

## What You Can Do

- Import one or many nested Skills from arbitrary zip packages.
- Validate packages against the Agent Skills `SKILL.md` format.
- Search and browse Skills in a workspace.
- Preview Skill metadata and package files.
- Use Forge's AI-guided interview to compose a downloadable project harness
- Freeze completed Forge sessions as Projects that track repository Skill, MCP, and Rule bindings
  from the current workspace's Skills, with workspace-scoped provider settings
  managed by owners and admins, plus private bounded session history.
- Publish revocable public share pages with verified zip downloads and Harhub or
  Agent Skills CLI install commands.
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

Try the hosted demo:

```text
https://harhub.rcpd.cc
```

Run Harhub locally:

```bash
npm install
npm run build
npm run start
```

Then open:

```text
App and API: http://127.0.0.1:3310/skills
Forge:       http://127.0.0.1:3310/forge
Docs:        http://127.0.0.1:3310/docs/
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

The development server exposes a development-only sign-in option: enter any
account email and continue without a password. The API is enabled only while
`npm run dev` runs with `NODE_ENV=development`; production and combined-server
startup do not expose this shortcut. Set `HARHUB_DEV_LOGIN_ENABLED=false` to
disable it during local development.

Fixed local ports:

- Web: `http://127.0.0.1:5176`
- API: `http://127.0.0.1:3310`

The documentation site runs separately in development:

```bash
npm run docs:dev
```

Open `http://127.0.0.1:5177/docs/`.

To start the local cloud-style stack with object storage:

```bash
npm run dev:cloud
```

The repository also includes a production multi-stage `Dockerfile`. See the
[deployment guide](./docs/guide/deployment.md) for build and runtime details.

## CLI

Install the current beta from npm:

```bash
npm install -g harhub@beta
```

Or install it from a checkout:

```bash
npm install
npm run build
npm install -g .
```

Sign in once with the OAuth device flow:

```bash
harhub login
harhub whoami
```

The CLI opens a browser for approval, lets you choose a default workspace once,
and saves the access token and workspace in the user config directory. The CLI
defaults to the hosted demo at `https://harhub.rcpd.cc`. For a local or
self-hosted instance, pass its URL during login:

```bash
harhub login --url http://127.0.0.1:3310
```

Without `--url`, every CLI command targets `https://harhub.rcpd.cc`. For a
self-hosted login, keep passing the same `--url`; the saved token and workspace
are reused only when they belong to that exact URL. `HARHUB_WORKSPACE_ID` and
`HARHUB_TOKEN` remain available as temporary overrides for CI and automation.

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

You can also upload an arbitrary zip containing one or more Skills. The CLI
imports every valid `SKILL.md` it finds, including files in nested directories:

```bash
harhub assets upload /path/to/repository-export.zip
```

The Web upload dialog previews every discovered Skill and lets you choose which
ones to import.

Upload and immediately create a public share link:

```bash
harhub skills upload /path/to/repo --all --share
```

Existing uploaded Skills can be shared and revoked by id, name, or slug:

```bash
harhub share <id|name|slug>
harhub unshare <id|name|slug>
```

Every public share page includes a direct zip download and one-line commands for
both Harhub and the open Agent Skills CLI. `harhub install` delegates placement
to the bundled `skills` installer, which supports Codex, Claude Code, Cursor,
OpenCode, and other compatible Agents:

```bash
harhub install https://harhub.rcpd.cc/s/<share-token>
npx skills add https://harhub.rcpd.cc/s/<share-token>
```

Target Codex explicitly and install globally without prompts:

```bash
harhub install https://harhub.rcpd.cc/s/<share-token> --agent codex --global --yes
```

Useful commands:

```bash
harhub login
harhub whoami
harhub skills scan [paths...]
harhub skills validate [paths...]
harhub skills create <name>
harhub skills upload [paths...]
harhub skills upload [paths...] --share
harhub install <share-url|token>
harhub share <id|name|slug>
harhub unshare <id|name|slug>
harhub assets list
harhub assets show <id|name|slug>
harhub logout
```

`scan`, `validate`, `list`, and `show` operate on local paths and local
`.harhub` indexes. `skills upload` packages valid local Skills and sends them to
the configured hosted or self-managed workspace. During import, Harhub stores
each Skill as an independent S3 file prefix and does not retain the source zip.
Preview reads those objects directly; download and discovery generate a standard
root-level Skill zip on demand. Uploaded Skills are immutable; edit the local
Skill and upload it again instead of patching it in place.

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

Password sign-in is enabled by default and automatically creates an account for
new email addresses. Disable it when using email codes or OAuth exclusively:

```bash
export HARHUB_PASSWORD_LOGIN_ENABLED=false
```

## Learn More

Detailed documentation lives in [`docs/`](./docs/).

For Skill package details, see [`docs/06-skill-standard.md`](./docs/06-skill-standard.md).
