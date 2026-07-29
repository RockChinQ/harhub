<div align="center">
  <img src="./docs/public/harhub-logo.svg" alt="Harhub" width="96" height="96" />
  <h1>Harhub</h1>
  <p><strong>Asset control for agent teams.</strong></p>
  <p>
    Manage reusable Agent Skills and connect them to the repositories that use them.
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

<!--
![Harhub abstract city marketing illustration](./docs/public/harhub-social-preview.png) -->

## Overview

Harhub is an open-source control plane for a team's agent harness.

The workspace Library manages reusable Agent Skills and MCP configurations:
teams can upload, validate, preview, and version both asset kinds. Standard
Skill packages can also be publicly shared and installed. Forge turns a project
brief into a repository-ready harness using relevant Library Skills and MCP
configurations. Projects connect that harness to GitHub, bind Library assets to
repository files, inventory rules and agent instructions, and track drift.

## What You Can Do

- Import one or many nested Skills from arbitrary zip packages.
- Validate packages against the Agent Skills `SKILL.md` format.
- Search and browse Skills in a workspace.
- Preview Skill metadata and package files.
- Download or restore any of the five retained immutable Skill versions.
- Upload, validate, preview, download, and restore versioned MCP JSON
  configurations without exposing their values to Forge AI.
- Use Forge's adaptive AI interview to compose a downloadable project harness
  from the current workspace's Skills and MCP configurations.
- Resume URL-bound Forge sessions after navigation or restart, then freeze a
  completed session as a durable Project.
- Import an existing repository through a GitHub App, inventory supported
  harness files, review repository drift, and deliver approved Skill or MCP
  add/remove changes through pull requests.
- Publish revocable public share pages with verified zip downloads and Harhub or
  Agent Skills CLI install commands.
- Manage Harhub from the Web UI, CLI, or the authenticated Agent Operations MCP
  server.
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

## MCP Configurations

An MCP Library asset is one JSON file with an `mcpServers` or `servers` object.
Harhub stores the original configuration and retains its five latest immutable
versions. Forge sees only safe metadata (server names, count, and transport),
then copies the selected original file into `.harness/mcp/` during framework
materialization. It never sends configuration values to the AI provider.

Use environment-variable placeholders for credentials. Harhub warns when a
secret-like environment key contains a literal value. MCP configurations cannot
be publicly shared.

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
are reused only when they belong to that exact URL. `HARHUB_API_URL`,
`HARHUB_WORKSPACE_ID`, and `HARHUB_TOKEN` remain available as temporary
overrides for CI and automation.

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

Upload one MCP configuration:

```bash
harhub assets upload ./mcp.json --kind mcp \
  --name "Issue tracker" \
  --description "Use for projects that manage work in the team issue tracker."
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
harhub skills upload [paths...] --share
harhub skills list --remote
harhub skills show <id|name|slug> --remote
harhub skills edit <id|name|slug> [--file SKILL.md]
harhub assets list --remote
harhub assets list --remote --kind mcp
harhub download <id|name|slug> [-v 2] [-o skill.zip]
harhub projects list
harhub repositories status
harhub forge list
harhub install <share-url|token> -g -y
harhub share <id|name|slug>
harhub unshare <id|name|slug>
harhub logout
```

Common short options include `-y`/`--yes`, `-g`/`--global`, `-j`/`--json`,
`-r`/`--remote`, `-o`/`--output`, and `-w`/`--workspace`. Run
`harhub <assets|skills|projects|repositories|forge> help` for each command group.

`scan`, `validate`, local `list`, and local `show` operate on paths and `.harhub`
indexes. Add `--remote` to `assets/skills list` or `show` to query the workspace.
`skills upload` packages valid local Skills and sends them to the configured
hosted or self-managed workspace. During import, Harhub stores each Skill as an
independent S3 file prefix and does not retain the source zip. Preview reads
those objects directly; download and discovery generate a standard root-level
Skill zip on demand. Uploaded versions are immutable. `skills edit` downloads
the current package, edits and validates it, then uploads a new version. Harhub
retains the current package and four previous versions for authenticated
download or restore.

See the [CLI guide](./docs/guide/cli.md) for Project, GitHub Repository, Forge,
remote edit, download, streaming, and automation examples.

## Agent Operations MCP

The npm package also installs `harhub-mcp`, a stdio MCP server that exposes the
CLI's authenticated Library, Project, GitHub, and Forge operations to agents.
It reuses the login saved by `harhub login`:

```json
{
  "mcpServers": {
    "harhub": {
      "command": "harhub-mcp"
    }
  }
}
```

Three supporting Agent Skills live under [`skills/`](./skills/). Install one or
all of them directly from the repository:

```bash
npx skills add RockChinQ/harhub --skill harhub-library-operations harhub-project-operations harhub-forge-operations
```

See the [Agent Operations MCP guide](./docs/guide/mcp.md) for environment
configuration, filesystem boundaries, tool groups, and confirmation rules.

## Configuration

Asset uploads require S3-compatible object storage:

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

Start with:

- [Getting Started](./docs/guide/getting-started.md)
- [Agent Skills](./docs/guide/agent-skills.md)
- [Forge](./docs/guide/forge.md)
- [Projects](./docs/guide/projects.md)
- [GitHub Integration](./docs/guide/github-integration.md)
- [CLI](./docs/guide/cli.md)
- [Agent Operations MCP](./docs/guide/mcp.md)
- [Deployment](./docs/guide/deployment.md)

## License

Harhub is open source under the [Apache License 2.0](./LICENSE).
