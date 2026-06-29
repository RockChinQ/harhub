# SaaS MVP

Harhub's SaaS MVP keeps the implementation local-first while shaping the product around accounts and workspace tenants.

## Objects

- **Account**: a signed-in user with email, display name, password hash, and sessions.
- **Workspace**: a tenant boundary with default scan paths, a skill root, and a workspace-scoped catalog.
- **Membership**: the role link between an account and a workspace.
- **Session**: a bearer token issued after login or signup.

## Local Storage

Runtime state is stored in `.harhub/state.json` and ignored by Git. Workspace catalogs are stored separately:

```text
.harhub/
  state.json
  workspaces/
    ws_demo/
      skills.json
```

This is not a production database, but it gives the app real tenant boundaries before adding Postgres, SSO, billing, or hosted deployment.

## Default Seed

When no state file exists, Harhub creates:

```text
account: admin@harhub.local
password: harhub
workspace: Engineering Platform
```

The seeded workspace scans `examples` and writes its catalog to `.harhub/workspaces/ws_demo/skills.json`.

## API Shape

SaaS routes are workspace-scoped:

```text
POST /api/auth/login
GET  /api/session
GET  /api/workspaces
POST /api/workspaces
PATCH /api/workspaces/:workspaceId
GET  /api/workspaces/:workspaceId/skills
POST /api/workspaces/:workspaceId/skills/scan
POST /api/workspaces/:workspaceId/skills
```

Legacy `/api/skills` routes remain as a demo-workspace compatibility layer.
