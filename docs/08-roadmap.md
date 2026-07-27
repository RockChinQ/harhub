# 路线图

> 状态更新时间：2026-07-27。Phase 0 已完成；Phase 1 的 Project repository inventory、Phase 2 的 Skill versions/rollback，以及 Phase 4 的 Skills-first repository adoption 已落地。通用 Bundle distribution、完整治理和评估仍未开始。

## MVP 原则

MVP 应先证明 Harhub 能把散落的 Agent Skills 转化为可管理、可复用、可校验的 workspace assets，而不要求组织整体迁移或采用 Harhub 私有格式。

第一版应优先：

- CLI 本地发现和校验。
- Workspace catalog、搜索、上传和 preview。
- Agent Skills 官方格式与 zip 路径安全校验。
- 账号、workspace tenancy 和邀请。
- Hosted 与 self-managed 的 Postgres/S3 持久化路径。
- 至少一种可衡量的 download/install distribution action。

显式 Skill versions、GitHub App import 和 Project-scoped non-Skill inventory 已推进；通用 composition、lockfile、policy 和 cross-tool distribution 仍在 Skills 激活闭环之后。

## 当前优先里程碑：发布、分享与安装闭环

当前最高优先级是完成 [Agent Skill 发布、分享与安装闭环](./10-sharing-and-installation-loop.md)。基础路径已经存在：

- `harhub skills upload --share` 在上传成功后生成 public share URL。
- 已上传 Asset 可以通过 CLI 或 Web share/unshare。
- `/s/:token` 提供无需登录的 metadata、validation、download 和 install commands。
- Public share 提供 Agent Skills discovery index 和 SHA-256 archive digest。
- `harhub install` 可以下载并通过 Agent Skills CLI 安装到选择的 agent。

闭环仍需补齐：

- 用不可变 `AssetRelease` 固定 share 内容，避免同名重新上传改变旧链接。
- 记录 share view、download、install success/failure 和 revoke events。
- 为 public endpoints 添加 rate limiting 和 abuse controls。
- 在 workspace 中展示 activation 和 distribution progress。

退出标准：用户 A 用一次 CLI upload 得到链接，未登录的用户 B 能打开、下载或安装；A 撤销后所有 public access 同时失效，Harhub 能看到这次分发是否成功。

## Phase 0：基础

状态：**已完成**。设计文档、Apache-2.0 license、官方 Skill 标准说明、示例 Skills、Web/CLI 基础和 CI 已存在；Project scanner tests 覆盖常见 non-Skill harness discovery。

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

状态：**Project scope 已完成，组织级 catalog 待扩展**。已经具备 CLI 本地 Skill 扫描、zip upload、workspace-scoped Library、搜索、Web 列表和详情；GitHub App 可导入 existing repository，服务端 scanner 会盘点 Skills、MCP 配置、rules 和 agent instructions，并保存 scan snapshots、source provenance 与 ownership policy。

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

状态：**版本与校验子集已完成**。已经具备 Agent Skills 官方字段校验、路径安全检查、重新校验、不可变 version records、最近五版下载/回滚，以及 Project Skill fork 的文件级 diff。用户可读 release notes、通用 version-to-version diff、review state 和 policy checks 尚未实现。

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

状态：**Skills-first 子集已部分完成**。Public share、download、discovery 和 CLI install 已存在；Forge 可以生成含完整 Skill packages 和 GitHub workflow 的 harness。Projects 支持 GitHub App inventory、Skill fork drift/diff、Library 手工回流，以及显式 add/remove/bootstrap proposal 的 pull request delivery。通用 Bundle materialization、跨工具升级与 adoption dashboard 仍在规划中。

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

当前 `0.1.0-beta.5` 代码已实现：

- 本地 TypeScript CLI 和 React Web UI。
- Password、email code、Google/GitHub OAuth、sessions 和 account settings。
- Workspace、memberships、roles 和 invitations。
- Agent Skills 本地 scan、create、validate、package 和 interactive upload。
- Workspace-scoped Skill catalog、搜索、详情、文件树 preview、批量校验和删除。
- 当前版加最近四个旧版的不可变 Skill storage、历史下载和 rollback。
- Workspace Forge AI 配置/测试、适应式问题批次、流式可重入 operation、持久化 session、Harness ZIP 和 Project freeze。
- GitHub App repository import、scan snapshots、push webhook refresh、ownership policy、Project Skill forks、diff/人工 publish 和 PR proposals。
- 覆盖 Library、Projects、GitHub 和 Forge 的完整 CLI 与 stdio MCP server。
- Postgres-compatible state、normalized version/audit/repository projections、S3-compatible file storage 和本地 JSON fallback。
- 可撤销 public share 页面、标准化 zip download、Agent Skills discovery，以及可安装到目标 Agent 的 `harhub install`。
- Apache-2.0 license、`npm ci → check → test → build` CI、production build、VitePress docs、multi-stage Dockerfile、image deployment 和 npm release workflows。

公开 MVP 前的主要边界：

- Workspace Library 仍只管理 Skills；Project inventory 可以查看 Rules、MCP definitions 和 instructions，但不能将它们作为全生命周期 Library assets 发布。
- Hosted Library 只来自 zip upload 或显式 Project Skill publish；服务端不会扫描客户端本地路径。
- Skill 有显式 retained version history 和 Project fork diff，但 public share 仍未 pin 到 immutable release，也没有通用 approval lifecycle。
- 已有 public share/download、目标 Agent 安装和通用 `skills` CLI 互通，但没有 immutable release pinning、adoption event 或 usage analytics。
- 没有 quota、usage reporting、admin operations dashboard、public rate limiting 或完整 production operations controls。
- 已有 Project-scoped Skill drift 与 PR automation；没有通用 composition、lockfile、policy、cross-tool rollout 或 evaluation infrastructure。

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

1. 确定 immutable `AssetRelease` 模型，并把现有 share 从 asset pinning 迁移到 release pinning。
2. 确认 hosted free limits，并实现 quota 与 usage event schema。
3. 在公开注册前补齐 rate limiting、zip resource limits 和 production operations checks。
4. 将已实现的 connected GitHub scan 扩展为跨 Project inventory，并决定是否增加 zip URL 或其他 Git provider。
5. 补齐 contribution guide、security policy 和 production self-host runbook。
