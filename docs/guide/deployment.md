# Deployment

Harhub can run as a hosted SaaS service or a self-managed app.

## Build

```bash
npm run build
```

The build creates:

```text
dist/server.js
dist/web/
dist/web/docs/
```

The VitePress docs are built into `dist/web/docs`, so the production app can
serve them under `/docs/`.

## Runtime

```bash
npm run start
```

The production server serves the React app, API, and built documentation from a
single process. With the defaults, use:

```text
App:  http://127.0.0.1:3310/skills
API:  http://127.0.0.1:3310/api/health
Docs: http://127.0.0.1:3310/docs/
```

The listen address can be configured with:

```bash
HOST=0.0.0.0
PORT=3310
```

`5176` is only the Vite development port; it is not used by `npm run start`.

## Docker

The repository includes a multi-stage production `Dockerfile` that builds the
server, web app, and docs, then runs the combined service on port `3310`:

```bash
docker build -t harhub .
docker run --rm --env-file .env.production -p 3310:3310 harhub
```

The image defaults to `HOST=0.0.0.0` and `PORT=3310`. Database and object
storage addresses in `.env.production` must be reachable from inside the
container; containerized deployments normally cannot use `127.0.0.1` to reach
services running in another container.

The `Build Docker Image` GitHub workflow is configured to publish
`rockchin/harhub:latest` and a commit-SHA tag from `main`.

## State And Storage

For hosted operation, configure Postgres-compatible state and S3-compatible
object storage:

```bash
HARHUB_DATABASE_URL=postgres://user:password@host:5432/harhub
HARHUB_DATABASE_SSL=true
HARHUB_S3_BUCKET=harhub-assets
HARHUB_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Without `HARHUB_DATABASE_URL`, runtime state falls back to `.harhub/state.json`
and `.harhub/workspaces/<workspace-id>/assets.json`. This fallback is intended
for local development and small self-managed demos. Skill uploads still require
S3-compatible object storage.

## Forge AI

Forge can use any OpenAI-compatible chat completions endpoint to ask follow-up
questions and select relevant Skills. Owners and admins configure the base URL,
model, and API key separately for each workspace from **Workspace Settings →
Forge AI**. Provider credentials are not global environment settings.
The **Test connection** action sends one minimal JSON chat request using the
current form values without saving them. A blank API key field uses the
workspace's already encrypted key when one exists.

API keys are encrypted before they enter Postgres or local JSON state and are
never returned to the browser. Hosted and multi-instance deployments must set a
stable encryption key on every server instance:

```bash
HARHUB_ENCRYPTION_KEY=replace-with-a-long-random-secret
```

For local development, Harhub generates `.harhub/secrets.key` with private file
permissions when `HARHUB_ENCRYPTION_KEY` is absent. Keep that file stable while
workspace credentials exist. Without a workspace API key, or when its provider
is unavailable, Forge uses a bounded guided interview and deterministic fallback
composition. Generated ZIPs still contain the full selected Skill packages from
configured S3-compatible storage.

## Auth And Invitations

Optional hosted auth settings:

```bash
HARHUB_PUBLIC_URL=https://harhub.example.com
HARHUB_PASSWORD_LOGIN_ENABLED=false
RESEND_API_KEY=...
HARHUB_EMAIL_FROM="Harhub <hello@example.com>"
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

Password sign-in defaults to enabled. When enabled, submitting a new email to
`POST /api/auth/login` creates the account and its initial workspace. Set
`HARHUB_PASSWORD_LOGIN_ENABLED=false` for deployments that should use only
email codes or OAuth.

Set `HARHUB_PUBLIC_URL` to the browser-visible application origin. It is used
for OAuth callbacks, OAuth device verification, and invitation links; in the
combined production server it normally points to the same origin as the API.

OAuth callback URLs:

```text
https://harhub.example.com/api/auth/oauth/google/callback
https://harhub.example.com/api/auth/oauth/github/callback
```

## CLI OAuth Device Flow

Harhub exposes an RFC 8628 device authorization grant for the built-in public
CLI client. No client secret is distributed with the CLI. Discovery and flow
endpoints are:

```text
GET  /.well-known/oauth-authorization-server
POST /api/oauth/device/code
POST /api/oauth/token
GET  /api/oauth/device/authorization
POST /api/oauth/device/authorization
```

The verification page is served at `/device`. Device codes expire after ten
minutes, are stored as hashes, and can only be exchanged once. Production
deployments should expose `HARHUB_PUBLIC_URL` over HTTPS so the metadata issuer,
verification page, and token endpoint share the public origin.

The same public origin is used to generate `/s/:token` share links, public zip
download URLs, the share-relative Agent Skills discovery index, and the
`harhub install` / `npx skills add` commands shown on share pages. Set it to the
real browser-visible HTTPS origin in production.
