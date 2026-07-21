# 市场地图与竞品

> 数据截止 2026-07-21。公开数字只表示关注、分发或活动信号，不表示去重用户、团队留存或收入。

## 1. 这不是一个市场，而是六个相邻市场

“Harness 管理”把多种不同对象放在了同一个词里。现实价值链至少分成六层：

| 层级 | 主要对象 | 代表产品/项目 | 用户首先购买的价值 |
|---|---|---|---|
| 标准层 | `SKILL.md`、MCP schema | Agent Skills、MCP Registry | 互操作、格式稳定、生态兼容 |
| 公共供给与发现 | Skills、MCP servers、模板 | Anthropic Skills、skills.sh、Smithery、awesome lists | 找到可复用内容 |
| 安装与本地分发 | agent-specific 目录与配置 | Vercel `npx skills`、PromptHub | 一次安装到多个 agent |
| 私有 Registry 与治理 | 版本、namespace、RBAC、审核、审计 | Tessl、iflytek/skillhub | 团队可信供给与合规 |
| 质量与运行证据 | trace、eval、task outcome、red team | Langfuse、Promptfoo、Opik、OpenSpace | 知道变更是否有效或安全 |
| Repo adoption / Harness GitOps | repo 指令、Skills、Rules、MCP、drift、PR | Tessl；Harhub 的 Project Sync 原型 | 知道哪些仓库实际采用，并持续收敛 |

单个产品如果试图同时覆盖六层，很容易变成“每一层都能演示，但没有一层形成刚需”。这也是竞品数量多、品类认知却不清晰的第一原因。

## 2. 公开关注度快照

### 2.1 标准、内容与安装

| 项目 | 角色 | 创建时间 | Stars | Forks | 观察 |
|---|---|---:|---:|---:|---|
| `agentskills/agentskills` | Agent Skills 标准与文档 | 2025-12 | 23,271 | 1,552 | 标准本身已经形成显著关注 |
| `anthropics/skills` | 官方/示例 Skills | 2025-09 | 163,055 | 19,336 | 内容供给有爆发性传播，但仓库明确提醒关键任务需自行测试 |
| `vercel-labs/skills` | `npx skills` 安装器与开放生态 | 2026-01 | 26,754 | 2,255 | 把跨 agent 安装做成低摩擦基础设施 |
| `vercel-labs/agent-skills` | Vercel 官方 Skills | 2025-12 | 29,270 | 2,631 | 平台方直接拥有优质供给 |
| `obra/superpowers` | 软件开发 Skills 方法与内容 | 2025-10 | 258,427 | 23,031 | 明确的工作流内容比“管理工具”更容易传播 |
| `mattpocock/skills` | 工程 Skills 内容 | 2026-02 | 179,548 | 15,340 | 作者品牌与可直接使用内容形成强分发 |
| `VoltAgent/awesome-agent-skills` | 1000+ Skills 列表 | 2025-10 | 28,557 | 3,079 | 目录供给丰富，但不等于质量或团队采用 |
| `sickn33/agentic-awesome-skills` | 本地 catalog/control plane | 2026-01 | 43,661 | 6,462 | 本地 agent-first 管理也有显著兴趣 |

`skills` npm 包在 2026-06-20 至 2026-07-19 报告 52,733,560 次下载。这个数字很强，但可能包含 CI、重复安装和间接调用，不能直接解释为月活用户。

### 2.2 MCP 生态

| 项目 | 角色 | Stars | Forks | 观察 |
|---|---|---:|---:|---|
| `modelcontextprotocol/servers` | 官方 MCP server 集合 | 88,691 | 11,262 | 生态需求强 |
| `punkpeye/awesome-mcp-servers` | 社区目录 | 91,017 | 13,329 | 发现层比治理层更容易获得关注 |
| `modelcontextprotocol/registry` | 社区驱动 Registry 服务 | 7,052 | 906 | README 仍把服务描述为 preview/API v0.1 演进路径 |
| Smithery | 托管 MCP/Skills 目录与连接层 | — | — | 官网主张处理 auth、credentials、sessions；Skills 页面报告 18,793 个结果 |

MCP 的管理对象是远程服务、凭据、会话和 tool scopes，风险模型与静态 Skill 包不同。因此“同时支持 Skill 和 MCP”不能只是在数据库里多一个 asset type。

### 2.3 PromptOps、评估与可观测

| 项目 | 主要价值 | Stars | npm 近月下载 | 与 Harness 管理的关系 |
|---|---|---:|---:|---|
| Langfuse | traces、evals、metrics、prompt management、datasets | 31,546 | `langfuse` 6,438,594；`@langfuse/tracing` 4,332,819 | 强运行证据，但不是跨仓库 Skills/Rules 分发系统 |
| Promptfoo | prompts/agents/RAG 测试、红队与 CI | 23,452 | 1,626,279 | 强发布门禁，可成为 Harness release 的测试执行器 |
| Opik | agent/LLM tracing、eval、monitoring | 20,739 | — | 运行质量层，而非 repo adoption 层 |
| Agenta | 构建、分享和运行 agents | 4,317 | — | 正在向 agent workspace/runtime 扩展 |
| Latitude | AI monitoring | 4,463 | SDK 63,474 | 关注生产行为，不管理完整 Harness 生命周期 |

Prompt 管理已经被更大的 AI engineering/observability 产品吸收。单独的 Prompt Hub 很难守住边界，因为 prompt 版本必须和 traces、datasets、evals、deployment 绑定才产生持续价值。

## 3. 最直接的 Skills/Harness 竞品

### 3.1 Tessl：最强直接竞品与品类教育者

Tessl 官网使用的核心话术是：

> Skills are the new code. Treat them that way.

其公开产品声明已经覆盖：

- shared/private registry 与版本管理；
- security scan、policy gating、audit logs；
- ownership 与 contribution governance；
- published、project coverage、developer-machine activation 三层可见性；
- 以 eval 作为 Skills 的“unit tests”；
- 3,000+ searchable skills；
- 企业安全与 AI enablement 场景。

这几乎与 Harhub 长期文档中的 Registry + Governance + Evaluation 定位重合。Tessl 没有提供可与 GitHub stars 直接对照的公开采用数据；官网客户证言和功能声明可以证明其销售方向，但不能单独证明它已成为品类赢家。

**对 Harhub 的含义：** “企业级 Skill 治理平台”本身不是差异化；必须在 repo-native workflow、开源自托管、反向 drift 回流或特定区域/团队形态上建立更窄的优势。

### 3.2 iflytek/skillhub：成熟的开源私有 Registry

公开 README 声明并展示：

- Self-hosted/private、S3/MinIO、Postgres、Redis；
- semantic versions、`beta`/`stable` tags 和 `latest`；
- team/global namespaces；
- Owner/Admin/Member；
- namespace review、global promotion gate、audit log；
- 搜索、ratings、downloads；
- CLI 与 ClawHub-compatible registry；
- security scanner 与 Kubernetes/Docker 部署。

公开信号：2026-03 创建，4,834 stars、645 forks；`@astron-team/skillhub` 在固定近月窗口报告 2,268 次 npm 下载。GitHub release 二进制下载较低，说明 stars 与实际 CLI 获取不是同一口径。

**对 Harhub 的含义：** Harhub 不应把 semantic version、RBAC、私有部署或 Registry 当作长期独占卖点，这些更像进入市场的基础门槛。

### 3.3 PromptHub：本地多资产工作台

PromptHub 把 Prompt、Skill、MCP、Plugin、Rules 和项目级 AI 编程资产放在本地桌面工作区，公开声明：

- 向 15+ agent 平台一键安装 Skill；
- Prompt 版本与多模型测试；
- 自定义 Skill store 来源；
- 本地扫描；
- WebDAV 跨设备同步和自部署备份；
- 桌面、CLI 和项目级工作区。

公开信号：1,507 stars、183 forks，AGPL-3.0；稳定 release 的自动更新元数据有大量下载，但单个安装包下载明显更低，不能把更新检查数当作安装用户。

**对 Harhub 的含义：** 个人/小团队“统一管理并安装到多个客户端”已经有人做得更贴近桌面。Harhub 应避免成为远程版 PromptHub。

### 3.4 OpenSpace：质量证据与 Skill 演化

OpenSpace 的核心不是静态 Registry，而是：

- 记录 Skill 被选择、应用、完成或 fallback 的真实任务结果；
- 根据证据形成质量摘要；
- controlled evolution、provisional/trusted 状态和版本历史；
- local-first 使用，cloud 负责发现；
- permission-aware tools、sandbox 与可恢复 session；
- package/group/lineage 模型。

公开信号：2026-03 创建，6,833 stars、840 forks，MIT；v2 于 2026-07 发布。

**对 Harhub 的含义：** “质量不是 stars，而是真实任务结果”是正确方向；但 Harhub 不需要先做 agent runtime，可以通过 CI/eval adapter 和 repo adoption 事件获得较低侵入的质量证据。

### 3.5 Skills.sh：公共发现与安装的事实强者

Skills.sh 自称 “The Agent Skills Directory”，首页支持 Claude Code、Cursor、Codex、GitHub Copilot、Windsurf、Gemini 等多个 Agent，并公开展示排行、topics、official 和 security audits。抓取时首页还展示了 All Time 与单 Skill 计数。

**对 Harhub 的含义：** 公共 SEO、排行和安装已经有强入口。Harhub 没有必要用公共 Skill 数量与其正面竞争；应支持从公共源导入，再把内部审核、固定版本和仓库采用作为增值层。

### 3.6 Smithery：连接与托管层

Smithery 同时提供 MCP 与 Skills 目录。官网价值主张是“连接 agents 到服务，并处理 auth、credentials 和 sessions”，Skills 页面抓取时报告 18,793 个结果并显示 installs。

**对 Harhub 的含义：** 对 MCP 来说，真正的产品价值经常在 credential/session/runtime，而不是 metadata catalog。Harhub 近期只适合做 MCP inventory、risk 和 policy，不应贸然托管执行面。

## 4. 长尾项目说明进入门槛低、价值仍在分层

补充的 GitHub 搜索还出现了：

| 项目 | Stars | 切入点 | 解读 |
|---|---:|---|---|
| `Picrew/awesome-agent-harness` | 1,485 | Harness 项目、工具、benchmark 与指南目录 | “Agent Harness” 已成为显性品类词，但关注主要落在资源列表 |
| `affaan-m/agentshield` | 1,001 | Agent config、MCP 和 tool permission 安全扫描 | 安全价值可以独立成产品，不必等待全栈控制平面 |
| `nextlevelbuilder/skillx` | 158 | semantic search、leaderboard、rating、CLI marketplace | 公共 marketplace 进入门槛低、供给分散 |
| `kanyun-inc/reskill` | 57 | “npm for Agent Skills” | 包管理叙事反复出现，但网络效应尚未收敛 |
| `Tencent/teamai-cli` | 46 | “team harness for AI agents” | 大厂也开始使用 team harness 词汇，公开采用信号仍早期 |

这批项目不构成直接市场份额排名，却说明同一个痛点正在被拆成目录、安全、包管理、团队 CLI 等多个产品。Harhub 的竞争不是只来自完整平台，而是每个子问题都有更轻的替代方案。

## 5. 平台内建能力是最强替代品

VS Code 官方文档已经把 Agent Skills 作为 GitHub Copilot 的开放标准能力，覆盖 VS Code、Copilot CLI 和 cloud agent，并提供 Agent Customizations 管理入口。Agent Skills 官方站也展示大量兼容客户端。

因此客户的默认选择往往不是另一个创业产品，而是：

1. 把 `SKILL.md`、`AGENTS.md`、rules 和 MCP config 放在 Git；
2. 用 agent/IDE 自带的 discovery 和 installation；
3. 用模板仓库、脚本、包管理器或内部文档分发；
4. 用 Langfuse/Promptfoo 等现有平台补 traces 与 eval；
5. 只有跨仓库、跨 agent、合规和 drift 成本足够高时，才引入独立控制平面。

## 6. 市场空白不是“没有 Hub”，而是闭环断裂

当前各层都已有强者，但以下链路仍经常断裂：

```text
内部知识被写成 Harness
  → 经过版本、审核和安全检查
  → 被多个仓库实际采用
  → 在不同 Agent 中按预期触发
  → 产生任务质量证据
  → 改进以 PR 或受控版本回流
```

Harhub 的机会不在左侧再建一个目录，而在中间的 **repository adoption、drift、review 与回流**。这是离 Git 足够近、又没有要求 Harhub 成为 agent runtime 的位置。
