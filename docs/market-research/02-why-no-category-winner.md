# 为什么还没有公认的 Harness 管理赢家

## 结论

更准确的问题不是“为什么这个市场没有爆品”，而是：

> 为什么 Agent Skills、MCP、Prompt/eval 都有爆发性项目，团队级 Harness 控制平面却还没有形成公认赢家？

答案不是单一产品执行不够好，而是品类正处于**标准刚形成、分发先爆发、治理价值尚未被稳定度量**的阶段。直接竞品也非常年轻：Agent Skills 标准仓库创建于 2025-12，PromptHub 创建于 2025-11，Tessl 当前定位在 2026 年产品页面已明显转向 Skills 治理，iflytek/skillhub 和 OpenSpace 都创建于 2026-03，Harhub 创建于 2026-06。

## 1. “Harness”还不是稳定采购品类

不同团队对 Harness 的定义完全不同：

- Prompt engineer 认为是 prompts、datasets 和 evals；
- coding agent 用户认为是 `AGENTS.md`、rules、Skills、hooks 和 MCP；
- 安全团队认为是 tools、credentials、permissions 和 audit；
- 平台团队认为是组织 baseline、repo rollout、drift 和 policy；
- agent runtime 团队认为还包括 memory、scheduler、sandbox 和 execution traces。

当产品同时覆盖这些概念时，买方无法快速判断它替代什么预算、由谁拥有、成功指标是什么。

## 2. 管理对象具有不同的生命周期

| 对象 | 本质 | 关键生命周期问题 |
|---|---|---|
| Prompt | 可参数化文本/模板 | 变量、模型、dataset、线上版本、trace |
| Skill | 带脚本和资源的目录包 | 版本、依赖、兼容、安全、触发与效果 |
| Rule/Instruction | 带层级与作用域的文件 | precedence、glob、冲突、repo override |
| MCP server | 远程或本地执行服务 | auth、secret、tool scope、runtime、供应链风险 |
| Hook/Plugin | 可执行扩展 | 安装、权限、沙箱、升级、回滚 |
| Eval | 可执行质量契约 | dataset、judge、成本、可重复性、门禁 |

一个通用 CRUD catalog 无法解决这些差异。结果往往是产品演示很宽，但团队仍需回到 Git、IDE、MCP gateway 和 observability 工具处理真实生命周期。

## 3. Git 已经是“足够好”的默认替代品

Harness 资产天然是文本和目录，天然适合：

- Git history；
- pull request review；
- CODEOWNERS；
- template repository；
- package/submodule/subtree；
- CI validation。

独立平台如果只提供上传、搜索、预览和下载，价值不足以覆盖第二套权限、同步、迁移和运维成本。只有在跨仓库 inventory、版本解析、自动 rollout、drift、policy 和 adoption analytics 上显著优于 Git 拼装方案，客户才会持续使用。

## 4. 消费入口掌握在 Agent/IDE 平台手里

Claude、Codex、Cursor、GitHub Copilot、VS Code、Gemini 等直接决定：

- 搜索哪些目录；
- 如何触发 Skill；
- 支持哪些 frontmatter；
- rules 的 precedence；
- MCP 和 hooks 的权限模型；
- 是否提供组织级管理入口。

平台方可以快速吸收单一生态的目录、安装和同步功能。独立产品若只做跨工具安装，容易退化为最低公分母适配层；若使用私有格式，又会增加迁移阻力。

## 5. 公共市场与企业治理是两套相反的生意

### 公共市场追求

- 内容数量；
- SEO 与榜单；
- 一键安装；
- 作者传播；
- 免费、低摩擦、无需管理员。

### 企业治理追求

- 私有内容不外泄；
- 固定版本和来源；
- RBAC、审批、审计；
- 安全扫描和 policy；
- self-host/region/data residency；
- 可控 rollout 和 rollback。

公共 marketplace 的供给优势很难自然转化为企业私有资产，而企业治理的摩擦也会破坏公共产品的增长。很多产品在两者之间摇摆，既没有 consumer network effect，也没有 enterprise workflow lock-in。

## 6. 供给多不等于供给可信

创建一个 Skill 的成本很低，AI 又能批量生成内容，因此目录很快出现：

- 重复或近重复内容；
- 过期工具和命令；
- 夸大的描述；
- 未声明依赖；
- 恶意或高风险脚本；
- 只在作者环境中有效的流程；
- 用 stars/downloads 包装的低质量资产。

Anthropic 的 Skills README 也明确提醒关键任务需自行测试。OpenSpace 与 Tessl 都把“真实使用/评估”放在核心叙事，反过来证明静态目录和评分无法解决信任问题。

## 7. 行业还没有统一的质量单位

现有指标处于不同层次：

```text
Published → Installed → Present in repo → Discovered by agent
→ Activated → Task completed → Outcome improved
```

多数目录只能看到 published/downloaded；某些平台能看到 project coverage；只有深入 runtime 或收集任务证据，才能知道是否触发和是否有效。

如果无法证明 Harness 变更降低失败率、缩短任务时间、减少 token/返工或提高 policy compliance，产品就很难从“有趣工具”进入稳定预算。

## 8. 多边冷启动比普通开发者工具更严重

Harness 平台同时需要：

- 作者维护高质量资产；
- 平台/安全团队批准；
- 开发者安装或仓库采用；
- agent/runtime 产生使用信号；
- reviewer 处理改进和回滚。

缺少任何一方，catalog 都会变成只增不减的仓库。相比之下，一个优秀 Skill、安装器或 eval CLI 只需要单个开发者就能获得价值，因此更容易爆发。

## 9. Champion、用户与买方不是同一个人

- AI enablement/platform engineer 是 champion；
- 开发者是日常用户；
- security/compliance 是 veto 方；
- VP Engineering/CIO 可能是预算方。

治理太弱，预算方不买；治理太强，开发者绕过。产品必须先给开发者和平台团队带来可见的便利，再逐步引入控制，而不是从审批门户开始。

## 10. 接入成本发生在最敏感的位置

完整 Harness 管理通常要求访问：

- 私有 GitHub organization/repositories；
- CI secrets 和 Actions；
- 开发者本机 Agent 配置；
- 内部 Skills、rules 和 prompts；
- MCP credentials；
- 可能包含源代码或任务 trace 的 eval 数据。

这导致安全审查、GitHub App 权限、self-host 和数据边界成为首次价值之前的阻力。小团队感觉不值得，大企业销售周期又长。

## 11. 标准和平台变化速度快于治理产品

Agent Skills 的开放标准和跨客户端支持在 2025 年下半年后才快速形成；MCP Registry 也仍处于 API 演进阶段。产品若过早定义自己的 package、lockfile 或 translation model，可能很快与平台能力冲突；若只跟随标准，又难建立差异化。

这个市场当前更像 npm、GitHub Actions Marketplace 和软件供应链工具形成之前的阶段：包格式和安装先普及，组织级治理随后出现。

## 12. 开源热度制造了“好像已经有赢家”的错觉

stars 更偏好：

- 一看就懂的内容仓库；
- 复制即用的工具；
- 作者品牌；
- 快速获得结果的 demo。

企业治理的关键资产——私有 workspace、持续 repo adoption、approval、audit、policy——通常不会出现在公开 fork 或 star 中。反过来，高 stars 也不证明团队每周在使用。因此不能用公开目录的传播逻辑评估 B2B Harness PMF。

## 为什么现在仍值得做

上述原因并不说明市场不存在，反而说明前置条件正在成熟：

1. Agent Skills 已经形成开放格式与多客户端支持；
2. MCP 已经让工具连接成为通用层；
3. 多 Agent 并存使 vendor-neutral 管理更有价值；
4. 公共供给爆发后，重复、质量、安全和版本问题开始显性化；
5. 企业正在从个人试用转向组织推广，需要 inventory、policy 和 adoption 证据；
6. Tessl、OpenSpace 等产品开始把 activation/eval 放进核心叙事，说明市场正从“能安装”转向“是否有效”。

## 什么样的产品可能成为赢家

公认赢家需要同时满足五个条件：

### 1. 无迁移起步

先读取团队已有 Git 文件和目录，不要求先上传、改格式或搬迁 source of truth。

### 2. 在一条高频工作流中闭环

例如：

```text
发现 repo drift → 评审 → 发布修复 PR → 验证 → 追踪 adoption
```

而不是只提供低频 catalog 浏览。

### 3. 保持标准和平台中立

原生理解开放标准，同时保留 vendor-specific renderer/adapter，不把所有能力压成最低公分母。

### 4. 把治理变成开发者收益

自动消除重复、生成升级 PR、解释冲突、固定版本、减少手工同步；审批和审计成为这些便利的副产品。

### 5. 建立可信质量数据

至少区分：发布、仓库覆盖、安装/发现、实际触发、任务结果。没有这些层级，就无法形成质量排名、release gate 或 ROI。

## 对 Harhub 的直接结论

- 不要用“市场还没有人做”作为创业前提；已经有多条强竞品路线。
- 不要以公共 Skill 数量、stars 或通用安装能力作为核心目标。
- 不要把 Forge 生成量当作北极星；生成供给已经接近零成本。
- 优先验证 repo adoption/drift/review 回流是否是团队每周发生的问题。
- 把 GitHub App/read-only inventory、immutable release 和 usage events 视为产品前提，而不是后期企业功能。
- 如果设计伙伴只需要公共发现和个人多 Agent 安装，应承认 PromptHub/skills.sh 更合适，不要强行扩大 Harhub。
