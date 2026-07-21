# Harhub 产品定位

## 定位决策

Harhub 不应定位成：

- Prompt Hub；
- 公共 Skill marketplace；
- 通用 Agent asset manager；
- 另一个 Agent runtime；
- 只负责 AI 生成 Harness 的 Forge。

建议占据更窄、可验证的品类：

> **Repository-native Agent Harness Control Plane**
>
> 面向多仓库团队，盘点、版本化、分发和持续收敛 Skills、rules、instructions 与 MCP 配置的 GitOps 控制平面。

更短的内部名称可以是：**Agent Harness GitOps**。

中文价值主张：

> 知道每个仓库实际在用哪些 Agent Skills 和指令，让团队基线可评审地进入仓库，让仓库改进可追踪地回流。

英文价值主张：

> Know which agent skills and instructions are actually used across your repositories, then keep them reviewed, versioned, and in sync.

## 1. 为什么选择 repo-native

公开发现和安装已经有强入口，私有 Skill Registry 也有成熟竞品。Harhub 当前代码里最有辨识度的不是 Library 或 Forge，而是这条链：

```text
Workspace Library
  → Forge/Project freeze
  → GitHub Action 上报仓库 bindings
  → added / modified / missing drift
  → 文件级 diff
  → 人工 Sync to Library
```

这个闭环具备四个战略优点：

1. **贴近事实源。** Harness 最终必须存在于仓库或开发者环境，catalog 本身不是采用。
2. **产生持续事件。** Repo push、drift、review 和 rollout 比低频上传/浏览更容易形成周活。
3. **不必成为 runtime。** Harhub 可以与 Claude、Codex、Cursor、Copilot、Langfuse、Promptfoo 共存。
4. **能自然长出治理。** 固定版本、审批、policy、eval 和 audit 都可以挂在一次具体的 repo change 上。

## 2. 当前能力基线

基线：`main@4aa8de5`。状态只按代码判断。

### 已实现

| 能力 | 代码证据 | 对定位的意义 |
|---|---|---|
| Workspace、角色、邀请 | `src/state/access.ts`、`src/server/routes/workspaces.ts` | 团队租户基础 |
| Skill 上传、解析、校验、文件预览 | `src/features/skills/validation.ts`、`src/server/routes/assets.ts` | 可管理的初始制品 |
| Public share、下载与安装 | `src/server/routes/shares.ts`、`src/cli/commands/share.ts` | 分发原型 |
| Forge 访谈和 Harness ZIP 生成 | `src/server/routes/forge.ts`、`src/server/services/forge.ts` | 组合/创作入口 |
| Project freeze 与 bindings | `src/server/routes/projects.ts`、`src/state/projects.ts` | Repo adoption 模型基础 |
| GitHub Action sync token 与上报 | `src/features/projects/framework.ts`、`src/server/routes/projects.ts` | 仓库状态采集原型 |
| Skill added/modified/missing | `src/server/services/project-skill-forks.ts` | Drift 闭环 |
| 文件级 diff 与人工回流 Library | `src/web/src/views/project-skill-diff.ts`、`src/web/src/views/projects-view.tsx` | 最具辨识度的 review loop |
| Version history 元数据 | `src/features/assets/versioning.ts`、`tests/asset-versioning.test.ts` | 审计时间线基础 |
| 自托管部署基础 | `Dockerfile`、`docs/guide/deployment.md`、Postgres/S3 | 私有团队采用前提 |

### 部分实现

| 能力 | 当前边界 |
|---|---|
| Versioning | 有版本记录，但旧对象没有完整 immutable download/diff/rollback/release 语义 |
| RBAC | 有 Owner/Admin/Member，但多项 Asset/Project mutation 只检查 member |
| Repository integration | 依靠用户安装生成的 GitHub Action；没有 GitHub App、org/repo discovery 或既有仓库只读导入 |
| Multi-artifact Project | binding/schema 预留 Skill/MCP/Rule，完整 fork/diff/回流主要只覆盖 Skill |
| Cross-agent distribution | Share/install 借助通用 Skills CLI；尚无 org/team/repo renderer 与 rollout record |
| Trust | 有结构校验和 digest，没有 provenance、签名、security policy、approval 或 eval gate |

### 仍是规划

- GitHub organization inventory；
- 读取既有 `.cursor/rules`、`AGENTS.md`、Copilot instructions 和 MCP config；
- org/team/repo 分层 composition；
- `harhub.lock`；
- deterministic renderers；
- upgrade PR；
- policy engine、MCP risk、secret scan；
- activation/task outcome；
- evaluation adapters；
- audit/event/usage analytics；
- enterprise SSO/SCIM。

### 定位前必须处理的事实

Harhub 当前仓库没有 `LICENSE`。在许可证明确之前，可以说“source-available、self-hostable”，不能严谨地说“open source”。这会直接影响与 iflytek/skillhub 等 Apache-2.0 项目的竞争。

## 3. 初始 ICP

### 优先 ICP

- 20～200 名工程师；
- 至少 5 个活跃仓库，最好 10～100 个；
- 同时使用至少两种 coding agent/入口；
- 已经有内部 `AGENTS.md`、rules、Skills、prompt files 或 MCP 配置；
- 有明确的 AI enablement、developer platform 或 staff engineer owner；
- 私有知识使公共 marketplace 无法解决问题；
- 正在经历组织推广，而不只是少数个人试用。

### Champion

优先顺序：

1. AI Enablement / Developer Productivity lead；
2. Platform Engineering / DevEx staff engineer；
3. 负责 coding agent rollout 的工程经理；
4. 有跨仓库规范职责的架构/安全工程师。

### 最终用户

- 编写和改进 Skills/rules 的高级开发者；
- 接收 adoption/upgrade PR 的 repository maintainer；
- 评审高风险 Harness 变更的平台和安全人员。

### 暂不优先

- 只管理个人 Prompt 的用户；
- 只有一个仓库、一个 Agent 的小团队；
- 只想浏览公共 Skills 的用户；
- 需要托管 Agent runtime/MCP execution 的客户；
- 在组织层面尚未形成 Harness 资产的团队。

这些用户不是“差一点的 ICP”，而是由 PromptHub、skills.sh、Smithery 或 agent 厂商原生能力服务得更好。

## 4. 核心 JTBD

### JTBD 1：盘点

> 当公司推广多个 coding agents 时，我想知道每个仓库有哪些 Skills、rules、instructions 和 MCP 配置，这样我能识别重复、缺失、过期和高风险内容。

### JTBD 2：发布团队基线

> 当平台团队改进一套 Harness 时，我想通过可评审的 PR 分发到目标仓库，而不是手工复制或覆盖 repo-specific 约定。

### JTBD 3：持续收敛

> 当仓库团队本地修改 Harness 时，我想看见 drift、理解 diff，并决定保留本地 override、升级团队基线或把改进回流。

### JTBD 4：证明采用

> 当管理层投入 coding agent rollout 时，我想区分“已发布”“仓库已覆盖”“agent 实际发现/触发”“任务结果改善”，而不是用下载量冒充采用。

### JTBD 5：安全治理

> 当 Skills/MCP 可能执行代码或访问内部服务时，我想在分发前知道来源、权限、版本、审批和评估状态。

## 5. 竞争定位

| 替代/竞品 | 它更强的地方 | Harhub 应占据的差异 |
|---|---|---|
| Git + 模板仓库 | 原生、免费、已有 review | 跨仓库 inventory、drift、adoption graph、自动 PR 和解释 |
| skills.sh / awesome lists | 公共供给、SEO、低摩擦安装 | 私有团队基线、固定版本、repo adoption，不争公共数量 |
| PromptHub | 个人本地多资产管理、15+ 平台分发 | 多用户 workspace、仓库级 review/drift/回流 |
| iflytek/skillhub | 成熟 Registry、semver、namespace、RBAC、audit | Project/repository lifecycle；不在 Registry 基础功能上自我安慰 |
| OpenSpace | Runtime task evidence、quality、controlled evolution | 保持 runtime-neutral，通过 repo/CI/eval adapters 获取证据 |
| Tessl | 企业 Skill security、governance、eval、activation 叙事 | 开放自托管路线、Git-centric reverse sync、较小团队可自助采用；这些仍需验证 |
| Langfuse/Promptfoo/Opik | Traces、eval、red team | 作为集成执行器，不重做 observability/eval 平台 |
| IDE/Agent 原生管理 | 掌握最终消费入口 | 跨厂商、跨仓库的 source-of-truth 和 policy/adoption 视图 |

## 6. 产品楔子

### 不迁移的第一步

目标体验应该是：

> 连接 GitHub organization 或选择一组仓库，15 分钟内看到现有 Harness inventory、重复项、版本差异和 coverage。

当前产品还做不到这一点；它要求先通过 Forge/Project 生成并安装 workflow。因此下一个关键投资不是继续丰富 Forge，而是：

1. GitHub App 或最小权限 token；
2. read-only repo discovery；
3. 多种 Harness 文件识别；
4. 标准化 inventory；
5. 无需迁移的初始报告。

### 从盘点进入闭环

```text
Read-only inventory
  → 选择 canonical Skill/rule
  → 生成 adoption PR
  → 固定 release/digest
  → 检测 drift
  → review override 或 upgrade
  → 回流改进
```

只有当团队完成第二次 drift/review，Harhub 才从一次性审计工具变成工作系统。

## 7. 产品边界

### Harhub 应拥有

- Harness inventory 和 normalized metadata；
- logical asset、immutable version 和 approved release；
- repository binding 与 adoption state；
- composition decision 和 precedence explanation；
- rollout、drift、review 和 audit events；
- policy/eval 结果的统一门禁状态；
- 向各 Agent 格式渲染的 adapters。

### Harhub 不应拥有

- 通用 LLM tracing 后端；
- 长期 MCP runtime；
- 完整 coding agent；
- 公共内容创作者经济；
- 私有的 Skill 格式；
- 自动无审核地覆盖 repository-owned 文件。

## 8. 路线优先级

### Now：证明 repo workflow

1. Immutable `AssetVersion`/`AssetRelease` 和 share/project pinning；
2. GitHub read-only import 与 inventory；
3. 把现有 Project Sync 改造成既有仓库也能采用的 workflow；
4. usage/event schema：inventory、coverage、drift、review、sync；
5. Asset/Project mutation RBAC、rate limit、Forge SSRF 边界；
6. 明确 LICENSE；
7. 让 tests 成为 CI gate。

### Next：形成跨仓库复利

1. `AGENTS.md`、rules、Copilot instructions、MCP config 的只读 catalog；
2. canonical baseline 与 repo override；
3. adoption/upgrade PR；
4. drift explanation；
5. owner、review、approval 和 audit；
6. Promptfoo/现有 CI 的 eval adapter。

### Later：企业控制平面

- composition/lockfile；
- policy engine 和 MCP risk；
- staged rollout/rollback；
- machine activation；
- task outcome correlation；
- SSO/SCIM、billing 和 enterprise support。

## 9. 对外叙事顺序

不要从抽象的 “AI Harness management” 开始教育用户。建议顺序：

1. **问题：** “Your agent instructions are drifting across repositories.”
2. **即时结果：** “See every repo's Skills and instructions in one inventory.”
3. **持续工作流：** “Review, version, and sync changes through Git.”
4. **品类：** “A repository-native control plane for agent harnesses.”

Forge 可以保留为辅助卖点：从经过治理的 Library 组合初始 Project，而不是首页的品类定义。
