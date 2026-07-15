# SaaS MVP

Harhub 的 SaaS MVP 采用云原生持久化优先，同时保留本地 JSON fallback 方便 self-host demo 和离线开发。Hosted deployment 中，API 进程不依赖本地 `.harhub` 状态文件，可以通过横向扩容连接同一组 managed Postgres 和 S3-compatible object storage。

本文记录当前 `0.1.0-beta.2` 的实现快照。当前 hosted catalog 只接受 uploaded Skill zip；本地目录发现由 CLI 完成，服务端不接收或扫描本地路径。

## 对象

- **Account**：已登录用户，包含邮箱、显示名、密码哈希和 sessions。
- **Account Identity**：Google/GitHub OAuth identity 与 Harhub account 的绑定关系。
- **Workspace**：租户边界，包含成员关系和 workspace 级 asset catalog。
- **Membership**：账号与 workspace 之间的角色关系。
- **Session**：登录或注册后签发的 bearer token。
- **Workspace Invitation**：workspace-scoped 邀请，包含目标邮箱、角色、token、过期时间和接受状态。
- **Email Login Code**：短期一次性登录验证码，保存在 runtime state 中并限制尝试次数。
- **OAuth State**：Google/GitHub OAuth 跳转期间使用的短期 state、redirect path 和可选 invitation token。
- **Device Authorization**：CLI 使用的 RFC 8628 短期设备授权记录，只保存 device code hash、user code、轮询状态和批准账号。

## 云原生持久化

当 `HARHUB_DATABASE_URL` 存在时，Harhub 使用 Postgres-compatible 数据库作为运行态状态源：

```text
harhub_state
  id
  data jsonb
  updated_at

harhub_workspace_catalogs
  workspace_id
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

种子 workspace 的 asset catalog 初始为空。Skill package 通过 Web 或 CLI 上传到对象存储后，索引写入当前 backend：Postgres 中的 `harhub_workspace_catalogs`，或本地 fallback 的 `.harhub/workspaces/ws_demo/`。

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
HARHUB_PASSWORD_LOGIN_ENABLED=false
RESEND_API_KEY=...
HARHUB_EMAIL_FROM="Harhub <hello@example.com>"
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

密码登录默认启用。`POST /api/auth/login` 在邮箱尚未注册时自动创建账号和初始 workspace。只使用邮件验证码或 OAuth 的部署应设置 `HARHUB_PASSWORD_LOGIN_ENABLED=false`。

OAuth callback URL 使用 API host：

```text
https://harhub.example.com/api/auth/oauth/google/callback
https://harhub.example.com/api/auth/oauth/github/callback
```

如果 managed database 要求 TLS，设置：

```bash
HARHUB_DATABASE_SSL=true
```

进程监听和上传大小可通过以下变量调整：

```bash
HOST=0.0.0.0
PORT=3310
HARHUB_MAX_UPLOAD_BYTES=26214400
```

本地云原生开发可以运行：

```bash
npm run dev:cloud
```

该命令通过 Docker Compose 启动 Postgres 和 MinIO，并用相同的环境变量形态启动 API 和 Vite frontend。

## API 形态

当前 routes 如下。除 health、auth bootstrap、OAuth callback、invitation lookup 和 legacy demo route 外，业务 routes 都要求 bearer token；资产数据按 workspace 作用域组织。

```text
GET  /api/health
GET  /api/auth/config
POST /api/auth/login
POST /api/auth/email-code/request
POST /api/auth/email-code/verify
GET  /api/auth/oauth/:provider/start
GET  /api/auth/oauth/:provider/callback
POST /api/auth/logout
GET  /.well-known/oauth-authorization-server
POST /api/oauth/device/code
POST /api/oauth/token
GET  /api/oauth/device/authorization
POST /api/oauth/device/authorization
GET  /api/session
PATCH /api/account
POST /api/account/password
GET  /api/invitations/:token
GET  /api/workspaces
POST /api/workspaces
PATCH /api/workspaces/:workspaceId
GET  /api/workspaces/:workspaceId/members
POST /api/workspaces/:workspaceId/members
PATCH /api/workspaces/:workspaceId/members/:membershipId
DELETE /api/workspaces/:workspaceId/members/:membershipId
DELETE /api/workspaces/:workspaceId/invitations/:invitationId
POST /api/invitations/accept

GET  /api/workspaces/:workspaceId/assets
GET  /api/workspaces/:workspaceId/assets/:query
GET  /api/workspaces/:workspaceId/assets/:query/preview
POST /api/workspaces/:workspaceId/assets/upload
POST /api/workspaces/:workspaceId/assets/validate
POST /api/workspaces/:workspaceId/assets/bulk
POST /api/workspaces/:workspaceId/assets/:query/validate
DELETE /api/workspaces/:workspaceId/assets/:query

GET  /api/workspaces/:workspaceId/skills
GET  /api/workspaces/:workspaceId/skills/:query
POST /api/workspaces/:workspaceId/skills/validate
POST /api/workspaces/:workspaceId/skills/:query/validate
DELETE /api/workspaces/:workspaceId/skills/:query

GET  /api/skills
```

`/api/workspaces/:workspaceId/skills` 是 Assets API 的 Skills-only compatibility view；legacy `/api/skills` 只保留 demo workspace 的 read route。服务端已经移除 path-based scan、create 和 patch routes。Uploaded packages 是 immutable，修改后应重新上传 zip。

当前角色执行范围并不完全一致：workspace 重命名、邀请、成员角色修改和成员移除会执行 owner/admin 检查；资产 upload、validate 和 delete 目前只要求 workspace membership。按角色限制资产 mutation 仍是发布前 TODO。
