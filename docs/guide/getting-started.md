# Getting Started

Harhub is a control plane for team-owned agent assets. The workspace Library
manages standard Agent Skills, Forge composes project harnesses from them, and
Projects connect those harnesses to existing GitHub repositories. Project
inventory can also identify repository-owned MCP configuration, rules, and agent
instructions without turning them into a Harhub-specific format.

## Hosted Demo

Open the demo environment:

```text
https://harhub.rcpd.cc
```

The CLI also defaults to this hosted endpoint. Pass `--url` explicitly when you
want to target a local or self-hosted API.

## Local Development

Install dependencies and start the API plus Vite frontend:

```bash
npm install
npm run dev
```

Default local ports:

```text
Web: http://127.0.0.1:5176
API: http://127.0.0.1:3310
```

The docs server is a separate development process:

```bash
npm run docs:dev
```

It serves the documentation at `http://127.0.0.1:5177/docs/`.

The seeded demo account is:

```text
admin@harhub.local
harhub
```

## Local Cloud Stack

For upload flows, start the Postgres + MinIO development stack:

```bash
npm run dev:cloud
```

This keeps runtime state in Postgres-compatible storage and each imported
Skill's files in an independent S3-compatible object prefix. Source zip files
are discarded after import.

## Production Build

Build the API, web app, and documentation, then start the combined server:

```bash
npm run build
npm run start
```

The production server exposes all three surfaces on the API port:

```text
App:  http://127.0.0.1:3310/skills
API:  http://127.0.0.1:3310/api/health
Docs: http://127.0.0.1:3310/docs/
```

## Verify The Checkout

Before shipping changes, run:

```bash
npm run check
npm test
npm run build
```

## Next Steps

- Use **Library → Skills** to upload, validate, version, preview, share, or
  restore Agent Skills.
- Configure **Workspace Settings → Forge AI**, test the provider, then create a
  persistent Forge session.
- Freeze a generated framework as a Project or use **Import repository** to
  connect an existing GitHub repository.
- Run `harhub login` for CLI access or start `harhub-mcp` for agent-operated
  Library, Project, GitHub, and Forge workflows.
