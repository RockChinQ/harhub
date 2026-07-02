# SaaS MVP

Harhub 的 SaaS MVP 保持本地优先实现，同时围绕账号和 workspace 租户塑造产品。

## 对象

- **Account**：已登录用户，包含邮箱、显示名、密码哈希和 sessions。
- **Workspace**：租户边界，包含默认扫描路径、Skill root 和 workspace 级 catalog。
- **Membership**：账号与 workspace 之间的角色关系。
- **Session**：登录或注册后签发的 bearer token。

## 本地存储

运行态状态存储在 `.harhub/state.json`，并被 Git 忽略。Workspace catalog 单独存储：

```text
.harhub/
  state.json
  workspaces/
    ws_demo/
      skills.json
```

这不是生产数据库，但它在引入 Postgres、SSO、billing 或 hosted deployment 前，让应用拥有真实租户边界。

## 默认种子数据

当状态文件不存在时，Harhub 会创建：

```text
account: admin@harhub.local
password: harhub
workspace: Engineering Platform
```

种子 workspace 会扫描 `examples`，并将 catalog 写入 `.harhub/workspaces/ws_demo/skills.json`。

## API 形态

SaaS routes 按 workspace 作用域组织：

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

Legacy `/api/skills` routes 仍作为 demo workspace 的兼容层保留。
