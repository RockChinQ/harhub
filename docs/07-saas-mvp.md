# SaaS MVP

Harhub 的 SaaS MVP 采用云原生持久化优先，同时保留本地 JSON fallback 方便 self-host demo 和离线开发。Hosted deployment 中，API 进程不依赖本地 `.harhub` 状态文件，可以通过横向扩容连接同一组 managed Postgres 和 S3-compatible object storage。

## 对象

- **Account**：已登录用户，包含邮箱、显示名、密码哈希和 sessions。
- **Account Identity**：Google/GitHub OAuth identity 与 Harhub account 的绑定关系。
- **Workspace**：租户边界，包含默认扫描路径、Skill root 和 workspace 级 catalog。
- **Membership**：账号与 workspace 之间的角色关系。
- **Session**：登录或注册后签发的 bearer token。
- **Workspace Invitation**：workspace-scoped 邀请，包含目标邮箱、角色、token、过期时间和接受状态。

## 云原生持久化

当 `HARHUB_DATABASE_URL` 存在时，Harhub 使用 Postgres-compatible 数据库作为运行态状态源：

```text
harhub_state
  id
  data jsonb
  updated_at

harhub_workspace_catalogs
  workspace_id
  skill_catalog jsonb
  asset_catalog jsonb
  updated_at
```

这些表保存 accounts、sessions、workspaces、memberships 和 workspace asset indexes。Uploaded Skill zip bytes 不进数据库，继续存储在 S3/S3-compatible object storage。

本地 JSON fallback 仍然可用：当没有设置 `HARHUB_DATABASE_URL` 时，运行态状态存储在 `.harhub/state.json`，workspace catalog 存储在 `.harhub/workspaces/<workspace-id>/` 下。这只用于 self-host demo 和本地开发，不是 hosted operation 的默认路径。

## 默认种子数据

当状态不存在时，Harhub 会在当前 backend 中创建：

```text
account: admin@harhub.local
password: harhub
workspace: Engineering Platform
```

种子 workspace 会扫描 `examples`，并将 catalog 写入当前 backend：Postgres 中的 `harhub_workspace_catalogs`，或本地 fallback 的 `.harhub/workspaces/ws_demo/`。

## 配置

Hosted deployment 必须配置：

```bash
HARHUB_DATABASE_URL=postgres://user:password@host:5432/harhub
HARHUB_S3_BUCKET=harhub-assets
HARHUB_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

如果启用 hosted login 和邀请邮件，还需要配置：

```bash
HARHUB_PUBLIC_URL=https://harhub.example.com
RESEND_API_KEY=...
HARHUB_EMAIL_FROM="Harhub <hello@example.com>"
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

OAuth callback URL 使用 API host：

```text
https://harhub.example.com/api/auth/oauth/google/callback
https://harhub.example.com/api/auth/oauth/github/callback
```

如果 managed database 要求 TLS，设置：

```bash
HARHUB_DATABASE_SSL=true
```

本地云原生开发可以运行：

```bash
npm run dev:cloud
```

该命令通过 Docker Compose 启动 Postgres 和 MinIO，并用相同的环境变量形态启动 API 和 Vite frontend。

## API 形态

SaaS routes 按 workspace 作用域组织：

```text
POST /api/auth/login
POST /api/auth/email-code/request
POST /api/auth/email-code/verify
GET  /api/auth/oauth/:provider/start
GET  /api/auth/oauth/:provider/callback
GET  /api/session
GET  /api/workspaces
POST /api/workspaces
PATCH /api/workspaces/:workspaceId
GET  /api/workspaces/:workspaceId/members
POST /api/workspaces/:workspaceId/members
DELETE /api/workspaces/:workspaceId/invitations/:invitationId
POST /api/invitations/accept
GET  /api/workspaces/:workspaceId/skills
POST /api/workspaces/:workspaceId/skills/scan
POST /api/workspaces/:workspaceId/skills
```

Legacy `/api/skills` routes 仍作为 demo workspace 的兼容层保留。
