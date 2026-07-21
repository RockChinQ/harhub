# Harhub 设计文档

Harhub 是面向团队的 agent harness 控制平面。这里的 harness 指让 agent 在真实工程组织中变得有用且安全的一整层资产：Skills、MCP servers、规则、项目指令、设计指导、架构指导、校验检查和策略元数据。

多数团队其实已经有这些 harness 材料，但它们分散在不同仓库里，由不同人用不同约定维护。Harhub 的目标是在不强迫团队放弃既有知识所在仓库的前提下，让这一层 harness 资产变得可发现、可复用、可版本化、可校验、可治理。

## 当前实现与目标

当前 `0.1.0-beta.3` 仍以 Agent Skills 为主要制品，但 `main` 已经形成 Library、Forge、Project 和 repository sync 的早期闭环。已经实现的产品表面包括：

- React Web UI 和 TypeScript CLI。
- 账号、session、workspace、角色和邀请。
- 本地 Skill 扫描、官方格式校验、目录打包和 Workspace-scoped zip 上传。
- 搜索、详情、文件预览、批量校验、删除和 version-history 元数据。
- Public share page、下载、CLI 上传/分享和跨 Agent 安装命令。
- Forge AI 访谈、Harness ZIP 生成和 Project freeze。
- GitHub Action repository sync、Skill added/modified/missing drift、文件级 diff 和人工回流 Library。
- Postgres-compatible 运行态持久化和 S3-compatible zip 存储，以及本地 JSON fallback。
- Email/password、邮件验证码、Google/GitHub OAuth 登录。

GitHub organization 扫描器、多资产完整生命周期、immutable release/rollback、组合与 lockfile、策略引擎、跨工具 rollout 和任务结果评估仍是目标设计，不是当前 API 已经完整提供的能力。本文档集会明确区分“当前实现”和“目标架构”。

## 文档地图

- [00. 概览](./00-overview.md)：阅读入口、文档地图和 agent harness 工作定义。
- [01. 问题与缺口分析](./01-problem-and-gap-analysis.md)：说明为什么需要这个品类，以及它解决什么痛点。
- [02. 市场定位](./02-market-positioning.md)：为什么目标品类是团队 AI harness 管理，以及为什么 Skills 只是第一个切入点。
- [03. 需求文档](./03-requirements.md)：产品需求、用户、用例和非功能需求。
- [04. 产品设计](./04-product-design.md)：核心流程、信息架构和运营模型。
- [05. 架构设计](./05-architecture.md)：系统设计、核心服务、数据模型、组合模型和集成策略。
- [06. Agent Skills 标准](./06-skill-standard.md)：Harhub 在 MVP 中支持的外部 Skill 格式。
- [07. SaaS MVP](./07-saas-mvp.md)：本地优先应用中的账号、会话和 workspace 租户模型。
- [08. 路线图](./08-roadmap.md)：分阶段交付计划、MVP 边界和开放问题。
- [09. MVP 指标与 TODO](./09-mvp-todo.md)：开源加 SaaS MVP 指标、免费版限制、发布清单和实现 backlog。
- [10. Skills 发布与安装闭环](./10-sharing-and-installation-loop.md)：CLI 上传、public share page、下载、一键安装、撤销和分发指标。

## 工作定义

**Agent harness** 是围绕 AI agent 的一整套指令、能力、工具和约束，用于某个团队、项目或工作流。

它可以包括：

- Agent Skills 和可复用任务流程。
- MCP servers、连接器、工具权限和运行时配置。
- 规则和指令文档，例如 `AGENTS.md`、`DESIGN.md`、`ARCHITECTURE.md`、评审指南、runbook 和编码标准。
- Prompt 片段、角色定义、模板和工作流 playbook。
- 校验检查、示例、评估和 smoke tests。
- 所有权、来源、兼容性、安全性和发布元数据。

Harhub 将这些内容视为一等管理资产，而不是散落在仓库里的普通文件。
