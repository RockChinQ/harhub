# 需求

## 目标

Harhub 应帮助团队跨仓库和工作流管理 agent harnesses。

主要目标：

- 发现仓库中已有的 harness artifacts。
- 将不一致的文件规范化成通用模型。
- 按用途、owner、maturity、compatibility 和 adoption 对 harnesses 建立 catalog。
- 将多个 harness packages 组合成 resolved bundle。
- 检测重复、drift、策略违规和指令冲突。
- 对 harness packages 做版本管理并支持安全升级。
- 将 harness bundles 分发到仓库、agents、CLI、IDE 和 CI 系统。
- 在 harness 变更影响团队前完成校验。

## 第一版非目标

第一版不应试图成为完整 agent runtime。它应管理被其他 agents 和工具消费的 harnesses。

初始非目标：

- 替代 Git 成为所有 artifact 的事实源。
- 托管任意长期运行的 MCP servers。
- 构建通用 prompt IDE。
- 代表所有团队运行 production agents。
- 在无评审的情况下自动重写每个仓库的 rules。
- 解决所有组织知识管理问题。

## 用户

### 平台负责人（Platform Owner）

负责组织级 agent platform，希望获得一致默认值、可见性、治理和采用追踪。

需要：

- Org baseline harnesses。
- 策略和权限管理。
- 变更前影响分析。
- Adoption 和 drift dashboards。

### 团队负责人（Team Lead）

负责一组仓库，希望复用团队标准，而不是手动复制文件。

需要：

- 团队级 harness packages。
- Repo assignment 和 override controls。
- 升级建议。
- 冲突报告。

### Agent Harness 作者

创建 Skills、MCP 集成指南、rules 和 workflow playbooks。

需要：

- 清晰的包结构。
- 预览和校验。
- 版本和发布。
- 使用指标和反馈。

### 仓库维护者（Repository Maintainer）

希望 agents 在特定仓库内表现正确。

需要：

- Repo-specific composition。
- 生成或链接的 harness files。
- 本地 override 支持。
- 能捕获 drift 或破损 harness updates 的 CI checks。

### 评审、安全或合规负责人

评审高风险 harness 变更，尤其是 MCP access、secrets handling 和 agent autonomy。

需要：

- 评审工作流。
- 权限 diff。
- 审计日志。
- 策略规则和 exceptions。

## Harness Artifact 类型

Harhub 应支持这些 artifact 类型：

- **Rules**：自然语言指令、编码标准、设计指南、架构指导、评审实践和运行约束。
- **Skills**：可复用任务流程，包含指令、references、scripts、examples 和 allowed tools。
- **MCP definitions**：server metadata、安装说明、工具描述、scopes、环境要求和风险分类。
- **Templates**：prompt fragments、PR descriptions、review rubrics、changelog formats、issue triage flows 和生成文档结构。
- **Validation assets**：examples、task fixtures、tests、golden outputs、lint rules 和 evaluation scenarios。
- **Metadata**：owner、team、maturity、tags、compatibility、dependencies、provenance 和 lifecycle state。

## 功能需求

### 发现与摄入

- 扫描配置的仓库，寻找 Agent Skills 和已知外部 harness 配置文件。
- 检测常见文件名，例如 `AGENTS.md`、`DESIGN.md`、`ARCHITECTURE.md`、`ARCHITECHTURE.md`、`.cursor/rules`、`.codex/skills`、`.mcp.json` 和项目专属 harness 目录。
- 允许手动注册 harness package。
- 保留 source provenance：repository、branch、commit、path、author 和 review status。
- 将发现的 artifacts 规范化为通用内部模型。

### Catalog 与搜索

- 提供可搜索的 harness packages 和 artifacts catalog。
- 支持按 team、domain、language、framework、MCP server、maturity、owner、compatibility 和 adoption 过滤。
- 展示 package README、changelog、dependency graph、validation status 和 usage。
- 暴露重复或相似的 rules 和 Skills。

### 版本与发布

- 支持 harness assets 的 semantic versions。
- 存储不可变 released asset versions。
- 支持 prerelease、deprecated、archived 和 experimental 状态。
- 生成版本间 diff。
- 追踪 pinned 到每个版本的 consumers。
- 支持运行态分发记录，以便可复现地解析 harness。

### 组合

- 将多个 assets 组合成面向 repo、team、workflow 或 agent profile 的 resolved harness bundle。
- 支持分层，例如 org baseline 加 domain pack 加 repo pack。
- 检测重复、冲突、过期或缺失的 artifacts。
- 应用显式优先级规则。
- 必要时输出 resolved assignment record 和 materialized files。

### 分发与同步

- 提供 CLI，用于拉取、校验和 materialize harness bundles。
- 支持 CI checks，用于 drift、policy violations 和 invalid distribution records。
- 支持为 harness upgrades 生成 pull requests。
- 支持通过 API 做 runtime retrieval。
- 允许仓库选择 reference mode、materialized mode 或 hybrid mode。

### 治理与策略

- 支持按 package 和 artifact type 配置 ownership 和 review requirements。
- 按风险对 MCP tools 和 Skills 分类。
- 对高风险权限或组织级发布要求 approvals。
- 防止 secrets 被存储在 harness packages 中。
- 记录变更、approvals、policy exceptions 和 distribution events。

### 校验

- 对 Agent Skills 以及已知外部配置文件做结构校验。
- 对 MCP permissions、tool access 和 rule requirements 做策略校验。
- 对 composition 做校验，捕获冲突和未解析依赖。
- 可选地用代表性任务运行 agent behavior evaluations。
- 将 validation reports 作为 release gates 和 CI feedback 发布。

### 可观测性

- 追踪 package adoption、version drift、validation failures 和 policy exceptions。
- 展示 package update 会影响哪些 repos。
- 为 compliance 和 incident review 暴露 audit trails。

## 非功能需求

- **渐进采用**：团队可以先索引已有文件，再改变工作流。
- **Git-friendly**：源内容仍可在 Git 中评审。
- **可复现**：resolved bundles 按 version 和 commit pin 住。
- **默认安全**：packages 不含 secrets，MCP permissions 显式声明，有 audit logs。
- **低摩擦创作**：大多数用例只需要普通 Markdown 或既有外部格式。
- **可扩展**：随着时间支持新的 agent runtimes、IDE 和 artifact types。
- **企业可用**：RBAC、SSO-ready identity model、audit logs、retention controls 和 policy hooks。
- **快速反馈**：常见校验应足够快，适合普通 pull request workflow。

## 成功指标

- 被 Harhub 索引的仓库比例。
- 使用 resolved harness bundle 的仓库比例。
- 重复 rules 和 Skills 随时间减少的数量。
- Merge 前被阻止的 policy violations 数量。
- 推出 org baseline update 的平均时间。
- 通过生成 pull requests 完成的 harness upgrades 数量。
- Released harness packages 的 validation pass rate。
- 采用 harness 前后，用户报告的 agent task success。
