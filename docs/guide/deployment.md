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
