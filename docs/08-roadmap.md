# 路线图

## MVP 原则

MVP 应证明 Harhub 能把散落的 harness files 转化为可管理、可复用、可校验的 bundles，而不要求组织整体迁移。

第一版应优先：

- 发现。
- 建立 catalog。
- Agent Skills 官方格式校验。
- 版本化 releases。
- 简单组合。
- 本地 CLI 校验。
- Git-friendly 分发。

## Phase 0：基础

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

推荐第一版实现：

- 本地 CLI。
- 文件型或轻量数据库 catalog。
- Git repository scanner。
- Manifest validation。
- Package diffing。
- 面向 Markdown rules 和简单 MCP definitions 的 bundle resolution。
- Lockfile output。

MVP 后再延后：

- 完整 Web UI。
- 高级语义去重。
- 多租户企业 RBAC。
- Hosted runtime API。
- 自动组织级发布。
- 大规模 evaluation infrastructure。

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

1. 选择第一个消费路径：CLI-only、GitHub PR workflow 或 runtime API。
2. 明确 Harhub 运行态数据不会改变或包装 Agent Skills 格式。
3. 创建两个符合 agentskills.io 规范的示例 Skills。
4. 实现本地 scan 和 validate commands。
5. 用真实团队仓库作为 fixtures 来打磨模型。
