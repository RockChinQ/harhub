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

Required ports can be configured with:

```bash
HOST=0.0.0.0
PORT=3310
```

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

## Auth And Invitations

Optional hosted auth settings:

```bash
HARHUB_PUBLIC_URL=https://harhub.example.com
RESEND_API_KEY=...
HARHUB_EMAIL_FROM="Harhub <hello@example.com>"
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

OAuth callback URLs:

```text
https://harhub.example.com/api/auth/oauth/google/callback
https://harhub.example.com/api/auth/oauth/github/callback
```
