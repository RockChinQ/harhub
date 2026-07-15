# 路线图

> 状态更新时间：2026-07-15。Phase 0 的 Skills-first 基础已完成；Phase 1 和 Phase 2 已部分完成；Phase 3 至 Phase 5 尚未开始。当前 beta 已经包含 Web UI、多租户 workspace、认证、Postgres/S3 持久化和 hosted API，这些不再列为“MVP 后再做”。

## MVP 原则

MVP 应先证明 Harhub 能把散落的 Agent Skills 转化为可管理、可复用、可校验的 workspace assets，而不要求组织整体迁移或采用 Harhub 私有格式。

第一版应优先：

- CLI 本地发现和校验。
- Workspace catalog、搜索、上传和 preview。
- Agent Skills 官方格式与 zip 路径安全校验。
- 账号、workspace tenancy 和邀请。
- Hosted 与 self-managed 的 Postgres/S3 持久化路径。
- 至少一种可衡量的 download/install distribution action。

显式 versions、Git provider import、非 Skill inventory、composition、lockfile、policy 和 cross-tool distribution 在 Skills 激活闭环之后推进。

## Phase 0：基础

状态：**Skills-first 基础已完成**。设计文档、官方 Skill 标准说明、示例 Skills 和 CLI 基础已经存在；非 Skill harness fixtures 延后到 multi-artifact inventory 阶段。

目的：建立产品模型和仓库基础。

交付物：

- 设计文档。
- agentskills.io spec 对齐说明。
- 示例 Agent Skills。
- CLI command skeleton。
- 常见 harness files 的 test fixtures。

退出标准：

- 贡献者能理解 Harhub 是什么，以及第一版应构建什么。

## Phase 1：盘点与目录（Inventory And Catalog）

状态：**部分完成**。已经具备 CLI 本地 Skill 扫描、zip upload、workspace-scoped catalog、搜索、Web 列表和详情；Git provider、服务端 repository scanner 和非 Skill inventory 尚未实现。

目的：让已有 harness material 可见。

交付物：

- 面向本地路径和一个 Git provider 的 repository scanner。
- 常见 harness files 的 discovery patterns。
- 外部标准资产 inventory model。
- Skill upload flow。
- Searchable catalog API。
- 基础 Web 或 CLI catalog view。

退出标准：

- Harhub 能扫描一组仓库，并回答“我们有哪些 harness assets？”

## Phase 2：版本化与校验（Versioning And Validation）

状态：**部分完成**。已经具备 Agent Skills 官方字段校验、上传校验结果、路径安全检查、重新校验和不可原地修改的 uploaded packages；显式 version records、changelog、diff、review state 和 policy checks 尚未实现。

目的：让 harnesses 可发布且可信。

交付物：

- Agent Skills spec validation。
- Immutable uploaded Skill versions。
- Harhub-side review state，不改变 Skill 格式。
- Changelog 和 diff support。
- 面向 MCP definitions 和 forbidden secrets 的初始 policy checks。

退出标准：

- 团队能管理一个带 validation report 的 Agent Skill。

## Phase 3：组合与锁文件（Composition And Lockfiles）

状态：**规划中**。

目的：让 harnesses 能跨仓库复用。

交付物：

- Bundle definitions。
- Layered package resolution。
- 面向 rules、Skills 和 MCP definitions 的基础 merge strategies。
- Conflict 和 duplicate findings。
- `harhub.lock` generation。
- Bundle diff command。

退出标准：

- 仓库能将 org、team 和 repo packages 解析为可复现的 bundle。

## Phase 4：分发与仓库采用（Distribution And Repo Adoption）

状态：**规划中**。

目的：从管理走向实际使用。

交付物：

- Materialized file generation。
- 面向 harness adoption 和 upgrades 的 pull request generation。
- Drift detection。
- CI check integration。
- Adoption dashboard。

退出标准：

- 团队能通过 pull request 采用 bundle，并保持更新。

## Phase 5：治理与评估（Governance And Evaluations）

状态：**规划中**。

目的：让大规模 harness 变更更安全。

交付物：

- Review workflows。
- MCP 和 Skills risk classification。
- 带 expiry 的 policy exceptions。
- Agent behavior evaluation runner。
- Package rollout 前的 impact analysis。

退出标准：

- 高风险 harness 变更能在广泛发布前被评审、测试并审计。

## MVP 边界

当前 `0.1.0-beta.1` 已实现：

- 本地 TypeScript CLI 和 React Web UI。
- Password、email code、Google/GitHub OAuth、sessions 和 account settings。
- Workspace、memberships、roles 和 invitations。
- Agent Skills 本地 scan、create、validate、package 和 interactive upload。
- Workspace-scoped Skill catalog、搜索、详情、文件树 preview、批量校验和删除。
- Postgres-compatible state、S3-compatible zip storage 和本地 JSON fallback。
- Production build、VitePress docs、multi-stage Dockerfile、npm beta 和 release workflows。

公开 MVP 前的主要边界：

- 产品仍只管理 Skills，不管理 Rules、MCP definitions 或通用 harness files。
- Hosted workspace catalog 只来自 zip upload；服务端不扫描本地路径，也没有 Git provider import。
- Uploaded package 没有显式 version history、release、diff 或 approval lifecycle。
- 没有 distribution/download/install action 和 adoption event。
- 没有 quota、usage reporting、admin operations dashboard 或完整 asset mutation RBAC。
- 没有 composition、lockfile、policy、drift、PR automation 或 evaluation infrastructure。

## 开放问题

- Harhub 应直接拥有 asset releases，还是 releases 应始终映射到 Git tags？
- 应优先支持哪些 agent runtimes？
- 生成的 `AGENTS.md` 应完全 materialized，还是包含指向 Harhub-managed sections 的引用？
- 早期采用阶段，org baseline enforcement 应该多严格？
- 最小可用 harness quality evaluation format 是什么？
- 初始应采用哪套 MCP risk taxonomy？
- Package dependencies 是否允许 version ranges，还是组织应要求 exact pins？
- Harhub 应如何表示团队之间有意不同的 instructions？

## 建议的下一步决策

1. 选择第一个 distribution target：generic zip download、Codex local skills path 或 Claude-compatible path。
2. 确认 hosted free limits，并实现 quota 与 usage event schema。
3. 在公开注册前补齐 asset mutation RBAC、rate limiting 和 production operations checks。
4. 决定第一个导入来源：GitHub repository path、zip URL 或 connected repository scan。
5. 确认 OSS license，并补齐 contribution、security 和 self-host runbook。
