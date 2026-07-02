# 市场定位

## 品类

Harhub 应定位为 **团队 AI harness 管理**。

AI harness 是 coding agents 周围的运行层：Skills、MCP servers、工具权限、Cursor rules、Codex `AGENTS.md`、GitHub Copilot instructions、prompt 文件、评审准则、工作流 playbook、校验检查和策略元数据。

产品不应被定位成单纯的 Skill marketplace 或 asset library。这个品类过窄，也太容易被单个 agent 厂商吸收。

## 市场论点

工程团队正在同时采用多个 agent 入口：Cursor、Claude Code、Codex、GitHub Copilot、ChatGPT、CI agents、内部 CLI 和基于 MCP 的工作流。每个入口都有自己的配置模型，但底层组织问题是相同的：

- Agents 应该使用哪些指令和工具？
- 谁负责维护它们？
- 哪些版本已被批准？
- 哪些仓库正在消费它们？
- 哪些 MCP 工具有风险？
- 版本之间发生了什么变化？
- 团队能否发布、审计并回滚一次 harness 更新？

Harhub 应该负责跨工具管理层，而不是与某一个 agent runtime 竞争。

## 买方痛点

最强的痛点不是存储，而是运营控制：

- 平台团队需要跨仓库的一致 agent 行为。
- 安全团队需要看清 MCP access、工具 scope、secrets 和高风险自动化。
- 工程经理需要所有权、生命周期状态和采用信号。
- 开发者需要可信 catalog，而不是从随机仓库复制过期规则。
- AI 推广者需要分发优秀 harness pattern 的方式，而不是手动打开几十个 pull requests。

## 产品边界

Harhub 应管理被其他工具消费的 harness assets。它不应变成通用 agent runtime。

范围内：

- Registry 和 catalog。
- 校验和策略检查。
- 所有权、生命周期和评审状态。
- 版本、发布和回滚。
- 面向目标环境的分发。
- 使用和采用分析。

近期范围外：

- 运行任意长期存在的 MCP servers。
- 替代 IDE agent 产品。
- 替代 Git 成为事实源。
- 在无评审的情况下自动重写所有仓库。

## MVP 切入点

当前 MVP 应继续保持 Skills-first：

- Skills 有具体的包结构。
- Skills 可以被上传、解析、校验、预览和安装。
- Skills 能形成可衡量的激活闭环。
- Skills 比完整 harness composition 更容易解释。

产品文案仍应明确：Skills 是第一个资产类型，不是最终产品品类。

## 扩展路径

当 Skills 闭环被验证后，按以下顺序扩展：

1. **只读 harness inventory**：发现仓库中的 `.cursor/rules`、`AGENTS.md`、Copilot instructions、prompt 文件和 MCP 配置文件。
2. **治理元数据**：为所有资产类型补充 owner、lifecycle、compatibility、risk、review status 和 approval history。
3. **MCP governance**：server registry、tool scopes、required env vars、risk labels 和 policy checks。
4. **跨工具分发**：将已批准的 harness packages 渲染到 Codex、Claude Code、Cursor、Copilot、CI 和仓库目标。
5. **组合与 lockfiles**：解析 org baseline、team pack、repo pack 和 workflow-specific pack，并显式处理优先级。
6. **评估闭环**：在大范围发布前，用代表性任务校验 harness 变更。

## 定位声明

Harhub 是面向团队管理 AI harness 的控制平面。它帮助工程组织发现、校验、治理、版本化并分发 Skills、MCP servers、规则和指令，让 agents 能在不同工具和仓库中可靠运行。
