# SaaS MVP

Harhub 的 SaaS MVP 采用云原生持久化优先，同时保留本地 JSON fallback 方便 self-host demo 和离线开发。Hosted deployment 中，API 进程不依赖本地 `.harhub` 状态文件，可以通过横向扩容连接同一组 managed Postgres 和 S3-compatible object storage。

本文记录当前实现快照。Hosted catalog 接受任意 zip：服务端递归发现其中一个或多个 `SKILL.md`，Web 先展示候选供勾选，CLI 默认导入所有合法候选。本地目录发现仍可由 CLI 完成，服务端不会接收客户端本地路径。

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
- **Asset Share**：workspace member 为 uploaded Asset 创建的可撤销 public bearer link；当前引用 logical asset，后续应引用 immutable release。

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

这些表保存 accounts、sessions、workspaces、memberships、invitations、device authorization、asset shares 和 workspace asset indexes。上传源 zip 不进数据库，也不会保留在对象存储中；每个导入后的 Skill 版本都以独立 S3 prefix 逐文件存储。每个 Skill 最多保留当前版本和最近四个旧版本，超出窗口的对象会在 catalog 成功更新后清理。

本地 JSON fallback 仍然可用：当没有设置 `HARHUB_DATABASE_URL` 时，运行态状态存储在 `.harhub/state.json`，workspace catalog 存储在 `.harhub/workspaces/<workspace-id>/` 下。这只用于 self-host demo 和本地开发，不是 hosted operation 的默认路径。

## 默认种子数据

当状态不存在时，Harhub 会在当前 backend 中创建：

```text
account: admin@harhub.local
password: harhub
workspace: Engineering Platform
```

种子 workspace 的 asset catalog 初始为空。Skill 通过 Web 或 CLI 导入后，每个候选被拆成独立对象目录，索引写入当前 backend：Postgres 中的 `harhub_workspace_catalogs`，或本地 fallback 的 `.harhub/workspaces/ws_demo/`。详情 preview 直接读取对象文件；分享下载和 discovery 按内容摘要动态生成并短时缓存标准根结构 zip。

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

当前 routes 如下。除 health、auth bootstrap、OAuth callback、device flow、invitation lookup、public share 和 legacy demo route 外，业务 routes 都要求 bearer token；资产数据按 workspace 作用域组织。

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
GET  /api/workspaces/:workspaceId/assets/:query/versions/:version/download
POST /api/workspaces/:workspaceId/assets/upload
POST /api/workspaces/:workspaceId/assets/validate
POST /api/workspaces/:workspaceId/assets/bulk
POST /api/workspaces/:workspaceId/assets/:query/validate
POST /api/workspaces/:workspaceId/assets/:query/versions/:version/rollback
DELETE /api/workspaces/:workspaceId/assets/:query
GET  /api/workspaces/:workspaceId/assets/:query/share
POST /api/workspaces/:workspaceId/assets/:query/share
DELETE /api/workspaces/:workspaceId/assets/:query/share

GET  /api/public/shares/:token
GET  /api/public/shares/:token/download
GET  /s/:token/.well-known/agent-skills/index.json

GET  /api/workspaces/:workspaceId/skills
GET  /api/workspaces/:workspaceId/skills/:query
POST /api/workspaces/:workspaceId/skills/validate
POST /api/workspaces/:workspaceId/skills/:query/validate
DELETE /api/workspaces/:workspaceId/skills/:query

GET  /api/skills
```

`/api/workspaces/:workspaceId/skills` 是 Assets API 的 Skills-only compatibility view；legacy `/api/skills` 只保留 demo workspace 的 read route。公开 share token 是可撤销 bearer link；公开响应不会暴露 S3 bucket 或 object key，asset 删除时对应 share 也会失效。Discovery response 使用 archive URL 和 SHA-256 digest，让兼容 Agent Skills CLI 可以直接消费 share URL。

当前 share 通过 `assetId` 查找 workspace catalog 中的当前对象，还没有 immutable release snapshot。闭环完成前需要让 share pin 到具体 upload release，避免同名重新上传改变旧链接内容。详细设计见 [Agent Skill 发布、分享与安装闭环](./10-sharing-and-installation-loop.md)。

服务端已经移除 path-based scan、create 和 patch routes。Uploaded packages 不支持原地 patch，修改后应重新上传 zip。

当前采用简化 workspace RBAC：owner/admin 可以执行 Asset upload、validate、share、delete、历史版本回滚以及 Project create、freeze、repository connection、sync-token rotation 和 Library publish；member/viewer 可以读取 workspace 资源。Project GitHub Action 继续使用单个 Project 的专用 sync token。
