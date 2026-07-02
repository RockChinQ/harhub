# 问题与缺口分析

## 摘要

团队正在许多仓库中快速创建 agent harness 材料：`AGENTS.md` 文件、本地编码规则、MCP 设置说明、prompt 片段、Skills、设计文档、架构指南、评审准则和特定工作流指令。这些资产通常很有价值，但大多作为本地仓库知识维护，而不是作为共享组织基础设施来管理。

结果就是碎片化。两个仓库可能用不同方式解决同一个 harness 问题。一个高质量 Skill 可能已经存在却不可见。一个不安全的 MCP 权限模式可能在项目之间被复制。一个团队改进了 agent rules，但其他团队不知道、无法比较，也不能安全升级。

Harhub 通过成为 agent harness 的 registry、治理层、校验层、组合引擎和分发系统来填补这个缺口。

市场不应被描述为“上传 Skills 的地方”。这个说法太窄，也很容易被单个 agent 厂商吸收。更强的品类是 **团队 AI harness 管理**：一个跨工具控制平面，用于管理工程团队希望 agents 遵循的上下文、工具、规则和策略。

## 当前缺口

Agent harness 目前被当作文件、约定或部落知识来管理。这会带来几个问题：

- **没有 inventory**：团队不知道已经有哪些 Skills、MCP tools 和 rules。
- **没有质量信号**：很难区分经过实战验证的 harness 和实验性内容。
- **没有所有权模型**：重要指令可能没有清晰的 maintainer、reviewer 或 lifecycle。
- **没有版本契约**：harness 变更可能随着时间悄悄改变 agent 行为。
- **没有依赖图**：团队看不到哪些仓库使用了哪些 rules、Skills、MCP servers 或 prompt fragments。
- **没有冗余控制**：相似规则会被反复写成略有不同的版本。
- **没有冲突检测**：一个规则可能要求偏好某个框架或流程，而另一个规则禁止它。
- **没有策略边界**：MCP servers 和 agent capabilities 可能在缺少一致评审的情况下被启用。
- **没有发布机制**：缺少将推荐 org baseline 发布到多个仓库的清晰路径。
- **没有校验闭环**：harness 变更在采用前很少用真实任务测试。

## 为什么现有工具不够

Git 仓库适合作为事实源，但不是好的跨仓库发现系统。Package registries 擅长分发代码，但通常不了解规则优先级、prompt 组合、MCP 权限或 agent 行为校验。文档门户适合人阅读，但不会产出可执行的 harness bundles。

Harhub 应补充这些系统：

- 将源材料保留在团队已经用来评审和维护的 Git 中。
- 跨仓库索引、规范化并理解 harness artifacts。
- 提供 curated catalog 和 dependency graph。
- 将 harnesses 组合成面向特定团队、仓库和工作流的 resolved bundles。
- 用测试、策略检查和 agent 行为评估校验 harnesses。
- 将 bundles 分发回仓库、CLI、IDE、CI 系统和 agent runtimes。

它也应补充厂商专属 AI admin panels。Cursor、GitHub Copilot、Claude、Codex 和 ChatGPT 都能管理自己生态的一部分，但使用多个工具的团队仍需要一个中立层来：

- 跨竞争性的 agent surfaces 盘点 harness assets。
- 规范化 ownership、lifecycle、risk 和 approval metadata。
- 将已批准资产翻译成目标专属格式。
- 在 Git 中保留 source-of-truth 文件，同时提供 SaaS governance 和 auditability。
- 检测已批准 harness packages 与仓库实际运行内容之间的 drift。

## 核心机会

机会在于在原始仓库文件和 agent execution 之间创建共享 harness 层。

这一层应回答以下问题：

- 我们组织中有哪些 harnesses？
- 哪些 harnesses 是 frontend、backend、infra、security、data 或 design work 的 canonical 版本？
- 哪些仓库使用了这个 rule 或 MCP server？
- 哪些 Skills 是重复的、过期的、不安全的或高质量的？
- 从 harness version `1.4.0` 升级到 `1.5.0` 时会发生什么变化？
- 这个仓库能否安全采用 org baseline 加 domain-specific pack？
- 哪些指令冲突，哪一个优先？
- 这次 harness update 在代表性任务上提升还是降低了 agent performance？

## 初始切入点

第一版应保持 Skills-first，因为 Skills 比通用 rules 有更清晰的包边界：

- Skill 可以作为目录或 zip 上传。
- Skill 在 `SKILL.md` 中有标准 metadata。
- Skill 可以针对结构、链接、命名、重复内容和类似 secret 的模式进行校验。
- Skill 可以被预览、安装、下载和复用。

只有当这个切入点证明更大的控制平面闭环时，它才有价值：

1. 团队将 harness assets 带入 Harhub。
2. Harhub 校验并分类它们。
3. Owners 改进 metadata 和 trust signals。
4. 其他用户发现并复用它们。
5. Admins 获得足够可见性，从而有理由推进治理和分发工作流。

如果用户主要要求 Cursor rules、MCP registry、Copilot instructions 或 `AGENTS.md` 同步，而不是 Skill storage，这不是失败。这说明应扩大被管理的资产类型，同时保持同一个控制平面论点。

## 产品论点

Agent harnesses 会成为共享组织基础设施。最终胜出的系统会像 package registry、policy engine、docs catalog、configuration compiler 和 evaluation platform 的混合体一样管理它们。

Harhub 应成为这个系统。
