# 证据与研究方法

## 1. 口径

- 抓取日期：2026-07-21。
- GitHub 数字来自 REST API 的仓库快照。
- npm 数字来自 downloads API 的 `2026-06-20` 至 `2026-07-19` 固定窗口。
- 官网和 README 的功能、数量、客户证言属于产品方自述。
- Harhub 能力基线来自 `main@4aa8de5` 代码，而不是 roadmap 声明。

任何对外引用都应保留日期和限制。不要把 stars、forks、downloads、site-reported installs 换算成 MAU、付费团队或收入。

## 2. GitHub 快照

| Repository | Created | Pushed at | Stars | Forks | License field | Source |
|---|---:|---:|---:|---:|---|---|
| `agentskills/agentskills` | 2025-12-16 | 2026-07-10 | 23,271 | 1,552 | Apache-2.0 | [GitHub](https://github.com/agentskills/agentskills) |
| `anthropics/skills` | 2025-09-22 | 2026-07-17 | 163,055 | 19,336 | API returned null | [GitHub](https://github.com/anthropics/skills) |
| `vercel-labs/skills` | 2026-01-14 | 2026-07-16 | 26,754 | 2,255 | API returned null | [GitHub](https://github.com/vercel-labs/skills) |
| `vercel-labs/agent-skills` | 2025-12-08 | 2026-07-20 | 29,270 | 2,631 | API returned null | [GitHub](https://github.com/vercel-labs/agent-skills) |
| `iflytek/skillhub` | 2026-03-11 | 2026-07-21 | 4,834 | 645 | Apache-2.0 | [GitHub](https://github.com/iflytek/skillhub) |
| `legeling/PromptHub` | 2025-11-29 | 2026-07-16 | 1,507 | 183 | AGPL-3.0 | [GitHub](https://github.com/legeling/PromptHub) |
| `HKUDS/OpenSpace` | 2026-03-24 | 2026-07-17 | 6,833 | 840 | MIT | [GitHub](https://github.com/HKUDS/OpenSpace) |
| `langfuse/langfuse` | 2023-05-18 | 2026-07-21 | 31,546 | 3,329 | NOASSERTION | [GitHub](https://github.com/langfuse/langfuse) |
| `promptfoo/promptfoo` | 2023-04-28 | 2026-07-21 | 23,452 | 2,102 | MIT | [GitHub](https://github.com/promptfoo/promptfoo) |
| `comet-ml/opik` | 2023-05-10 | 2026-07-21 | 20,739 | 1,621 | Apache-2.0 | [GitHub](https://github.com/comet-ml/opik) |
| `Agenta-AI/agenta` | 2023-04-26 | 2026-07-21 | 4,317 | 575 | NOASSERTION | [GitHub](https://github.com/Agenta-AI/agenta) |
| `latitude-dev/latitude-llm` | 2024-06-28 | 2026-07-21 | 4,463 | 363 | MIT | [GitHub](https://github.com/latitude-dev/latitude-llm) |
| `modelcontextprotocol/registry` | 2025-02-05 | 2026-07-15 | 7,052 | 906 | NOASSERTION | [GitHub](https://github.com/modelcontextprotocol/registry) |
| `modelcontextprotocol/servers` | 2024-11-19 | 2026-07-10 | 88,691 | 11,262 | NOASSERTION | [GitHub](https://github.com/modelcontextprotocol/servers) |
| `punkpeye/awesome-mcp-servers` | 2024-11-30 | 2026-07-13 | 91,017 | 13,329 | MIT | [GitHub](https://github.com/punkpeye/awesome-mcp-servers) |
| `VoltAgent/awesome-agent-skills` | 2025-10-28 | 2026-07-10 | 28,557 | 3,079 | MIT | [GitHub](https://github.com/VoltAgent/awesome-agent-skills) |
| `sickn33/agentic-awesome-skills` | 2026-01-14 | 2026-07-20 | 43,661 | 6,462 | MIT | [GitHub](https://github.com/sickn33/agentic-awesome-skills) |
| `obra/superpowers` | 2025-10-09 | 2026-07-21 | 258,427 | 23,031 | MIT | [GitHub](https://github.com/obra/superpowers) |
| `mattpocock/skills` | 2026-02-03 | 2026-07-17 | 179,548 | 15,340 | MIT | [GitHub](https://github.com/mattpocock/skills) |
| `Picrew/awesome-agent-harness` | 2026-03-30 | 2026-06-21 | 1,485 | 144 | null | [GitHub](https://github.com/Picrew/awesome-agent-harness) |
| `affaan-m/agentshield` | 2026-02-11 | 2026-06-23 | 1,001 | 218 | MIT | [GitHub](https://github.com/affaan-m/agentshield) |
| `nextlevelbuilder/skillx` | 2026-02-10 | 2026-03-08 | 158 | 32 | null | [GitHub](https://github.com/nextlevelbuilder/skillx) |
| `kanyun-inc/reskill` | 2026-01-21 | 2026-07-06 | 57 | 3 | MIT | [GitHub](https://github.com/kanyun-inc/reskill) |
| `Tencent/teamai-cli` | 2026-04-27 | 2026-07-21 | 46 | 13 | NOASSERTION | [GitHub](https://github.com/Tencent/teamai-cli) |
| `RockChinQ/harhub` | 2026-06-25 | 2026-07-20 | 0 | 0 | null | [GitHub](https://github.com/RockChinQ/harhub) |

`license` 是 API 返回字段，不是本研究重新完成的法律审计。某些仓库会在子目录或单独文件中使用不同许可。

## 3. npm 固定窗口快照

| Package | Downloads | Window | Source |
|---|---:|---|---|
| `skills` | 52,733,560 | 2026-06-20～2026-07-19 | [npm API](https://api.npmjs.org/downloads/point/2026-06-20:2026-07-19/skills) |
| `@astron-team/skillhub` | 2,268 | 同上 | [npm API](https://api.npmjs.org/downloads/point/2026-06-20:2026-07-19/%40astron-team%2Fskillhub) |
| `harhub` | 511 | 同上 | [npm API](https://api.npmjs.org/downloads/point/2026-06-20:2026-07-19/harhub) |
| `promptfoo` | 1,626,279 | 同上 | [npm API](https://api.npmjs.org/downloads/point/2026-06-20:2026-07-19/promptfoo) |
| `langfuse` | 6,438,594 | 同上 | [npm API](https://api.npmjs.org/downloads/point/2026-06-20:2026-07-19/langfuse) |
| `@langfuse/tracing` | 4,332,819 | 同上 | [npm API](https://api.npmjs.org/downloads/point/2026-06-20:2026-07-19/%40langfuse%2Ftracing) |
| `@latitude-data/sdk` | 63,474 | 同上 | [npm API](https://api.npmjs.org/downloads/point/2026-06-20:2026-07-19/%40latitude-data%2Fsdk) |

下载可能来自 CI、缓存、自动更新、重复安装和间接依赖，不能直接推导去重用户。不同语言生态也不应直接比较 npm 数字。

## 4. 官方标准与平台来源

| Source | 本研究使用的事实 | 限制 |
|---|---|---|
| [Agent Skills Overview](https://agentskills.io/home) | Skill 是包含 `SKILL.md` 的开放目录格式；支持 scripts/references/assets；强调 progressive disclosure 与跨客户端使用 | 官方标准说明，不证明组织采用 |
| [Agent Skills Specification](https://agentskills.io/specification) | Harhub 校验和兼容的标准来源 | 标准仍可能演进 |
| [VS Code Agent Skills](https://code.visualstudio.com/docs/agent-customization/agent-skills) | GitHub Copilot 在 VS Code、CLI、cloud agent 中支持开放 Agent Skills；VS Code 提供 Customizations 入口 | 证明平台吸收能力，不证明所有企业已启用 |
| [Skills.sh](https://skills.sh/) | 公共目录、topics、official、audits、多 Agent 安装与站内排行 | 排行/计数由站点定义，非独立审计 |
| [MCP Registry README](https://github.com/modelcontextprotocol/registry) | Registry 是面向 MCP clients 的 server 列表；README 记录 preview/API 演进 | README 状态可能滞后于部署状态 |

## 5. 产品官方来源

| Product | Source | 用于支持的结论 |
|---|---|---|
| Tessl | [Homepage](https://tessl.io/) | shared registry、version、security scan、policy、audit、project coverage、machine activation、eval；3,000+ searchable skills 为官网自述 |
| iflytek SkillHub | [README](https://github.com/iflytek/skillhub) | self-host、semver、tags、namespace RBAC、review、audit、CLI、安全扫描 |
| PromptHub | [README](https://github.com/legeling/PromptHub) | 本地 Prompt/Skill/MCP/Plugin/Rules 工作台、15+ Agent 安装、WebDAV、版本与多模型测试 |
| OpenSpace | [README](https://github.com/HKUDS/OpenSpace) | task-result quality、controlled evolution、local-first、quality records、runtime boundary |
| Smithery | [Homepage](https://smithery.ai/) / [Skills](https://smithery.ai/skills) | MCP auth/credentials/sessions；抓取时 Skills 页面报告 18,793 results |
| Langfuse | [README](https://github.com/langfuse/langfuse) | eval、observability、metrics、prompt management、datasets |
| Promptfoo | [README](https://github.com/promptfoo/promptfoo) | prompt/agent/RAG testing、red teaming、CI |

产品方的“used by”“customer quote”“installs”“searchable skills”没有被本研究独立审计，不能用于推导收入或留存。

## 6. Harhub 代码证据

基线：`main@4aa8de5`。

| 判断 | 主要代码/文档 |
|---|---|
| Workspace 与权限模型 | `src/state/access.ts`、`src/server/routes/workspaces.ts` |
| Skill 标准校验 | `src/features/skills/validation.ts` |
| Share/download/install | `src/server/routes/shares.ts`、`src/server/services/asset-shares.ts`、`src/cli/commands/share.ts` |
| Forge AI 组合 | `src/server/routes/forge.ts`、`src/server/services/forge.ts`、`src/web/src/views/forge-view.tsx` |
| Project 与 repository sync | `src/server/routes/projects.ts`、`src/state/projects.ts`、`tests/projects.test.ts` |
| Repo Skill fork/diff/回流 | `src/server/services/project-skill-forks.ts`、`src/web/src/views/project-skill-diff.ts`、`tests/project-skill-forks.test.ts` |
| Version history | `src/features/assets/versioning.ts`、`tests/asset-versioning.test.ts` |
| 当前与目标边界 | `docs/03-requirements.md`、`docs/08-roadmap.md`、`docs/09-mvp-todo.md` |
| 部署 | `Dockerfile`、`.github/workflows/`、`docs/guide/deployment.md` |

### 不能从当前代码声称的能力

- 完整 immutable historical packages 和 rollback；
- GitHub App/org discovery；
- 对既有仓库的自动 Harness inventory；
- MCP/rules 完整 lifecycle；
- composition/lockfile；
- policy/eval engine；
- activation/task outcome analytics；
- 企业级横向扩容安全；
- 正式 OSS 身份。

## 7. 未获得的证据

本轮没有可独立验证的：

- 各竞品付费客户数、ARR、留存或活跃团队数；
- Harhub 的真实去重注册、激活和留存；
- Skills.sh/Smithery 计数的完整定义；
- Tessl 的去重企业采用规模；
- GitHub stars 中自然增长、活动传播与异常流量的构成。

因此本文不对市场份额或“第一名”做数值排名。

## 8. 刷新方法

每次更新应：

1. 记录新的抓取日期；
2. 用 GitHub API 重新获取同一仓库集合；
3. 用固定 npm 日期窗口，避免 `last-month` 在文档中失去可重复性；
4. 检查 Agent Skills、VS Code/Copilot、MCP Registry 的标准变化；
5. 重新阅读 Tessl、SkillHub、PromptHub、OpenSpace 的官方定位；
6. 将 Harhub 最新代码能力与“已实现/部分实现/规划”矩阵重新对齐；
7. 保存新增来源，删除无法复核的二手说法；
8. 不用新 stars 覆盖旧数字而不更新日期。
