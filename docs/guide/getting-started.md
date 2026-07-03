# Getting Started

Harhub is a control plane for team-owned agent assets. The current product
focuses on Agent Skills: zip packages that contain a standard `SKILL.md`.

## Hosted Demo

Open the demo environment:

```text
https://harhub.rcpd.cc
```

The CLI also defaults to this hosted endpoint. Set `HARHUB_URL` only when you
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
Docs: http://127.0.0.1:5177/docs/
```

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

This keeps runtime state in Postgres-compatible storage and uploaded Skill zip
packages in S3-compatible object storage.

## Verify The Checkout

Before shipping changes, run:

```bash
npm run check
npm run build
```
