# Harhub PMF 策略

> 本文中的百分比、数量和价格都是待验证的决策阈值，不是 Harhub 已达到的数据。

## 1. 核心 PMF 假设

### 问题假设

多仓库团队在推广 coding agents 后，会出现可重复且有成本的 Harness drift：同一 Skill/rule 被复制、局部修改、过期或失去 owner，平台团队无法知道实际采用状态。

### 用户假设

AI enablement、DevEx 或 platform champion 愿意连接至少 5 个私有仓库，以换取 inventory、drift 和可评审 rollout；普通开发者不需要每天打开 Harhub，只需要在 Git/PR 工作流中受益。

### 产品假设

“读取已有仓库 → 形成 inventory → 分发 baseline PR → 检测 drift → 审核回流”比“上传和浏览 Skills”更能产生连续四周的使用。

### 商业假设

团队愿意为 active governed repositories、私有部署、安全/审计和减少人工同步付费，而不是按公共 Skill 数量或 Forge generation 次数付费。

## 2. 先验证哪一个市场

第一阶段只验证：

- 软件工程团队；
- coding agents；
- GitHub repositories；
- Skills + repo instructions/rules；
- 团队基线和 repo override。

暂不同时验证：

- 通用办公 Agent；
- 公共 creator marketplace；
- MCP hosting；
- Agent runtime；
- 完整 eval 平台；
- 所有 Git provider。

限制变量是为了判断真正的重复需求，而不是因为长期市场只包含 coding agents。

## 3. 设计伙伴筛选

### 必须满足

- 5 个以上活跃代码仓库；
- 至少两种 Agent/IDE 入口，或同一 Agent 在多个团队有不同配置；
- 已有至少 10 个 Harness 文件/目录；
- 有明确 champion；
- 愿意每周提供一次 30 分钟反馈；
- 可以为一组非关键仓库安装只读 App 或 GitHub Action。

### 加分项

- 20～200 名工程师；
- 已经建立 AI enablement/platform team；
- 发生过错误规则扩散、MCP 风险或 Skill 版本不一致；
- 有 self-host/data residency 要求；
- 正在比较 Claude Code、Codex、Cursor、Copilot 等多个工具。

### 排除项

- 只想下载公开 Skills；
- 只有个人配置；
- 无法访问任何测试仓库；
- 需求核心是 LLM tracing 或 Prompt A/B test；
- 需求核心是托管 MCP runtime。

## 4. PMF 实验序列

每个实验都必须记录原始证据：访谈原句、仓库数量、事件时间、操作步骤和是否再次使用。不要只记录“反馈很好”。

### E0：问题访谈，不演示产品

**样本：** 15 名符合 ICP 的 champion/maintainer。

**问题：**

1. 现在有哪些 Agent 配置和 Skills？分别放在哪里？
2. 最近一次跨仓库更新是怎样完成的？
3. 最近一次 drift、过期或冲突造成了什么返工？
4. 谁能批准修改？谁对安全负责？
5. 你现在如何知道某个配置真的被仓库或 Agent 使用？
6. 如果什么都不改变，未来六个月成本是什么？
7. 哪些仓库权限和数据绝不能给 SaaS？

**进入下一阶段的阈值：**

- 至少 8/15 能描述过去 60 天内的具体 drift/复制/采用问题；
- 至少 5/15 有明确 owner 和正在执行的组织推广；
- 至少 5/15 现有方案不只是“偶尔复制一个文件”；
- 至少 3 家愿意提供 5 个以上仓库做 pilot。

**停止/改向：** 若多数人认为 Git/template repo 已完全解决，且没有持续 adoption 问题，不应继续构建企业控制平面。

### E1：Concierge Harness Inventory

在还没有完整 GitHub App 时，由 Harhub 团队协助扫描 5～20 个 pilot 仓库，交付：

- Harness 文件清单；
- 重复/近重复 Skills 与 rules；
- 不同版本/digest；
- 未知 owner；
- 缺失团队 baseline 的仓库；
- 建议的 canonical/override 分类。

**要验证：** inventory 报告是否让 champion 做出真实决定，而不是只觉得“有意思”。

**成功阈值：**

- 5 家完成扫描，而不是只参加 demo；
- 其中 3 家在两周内处理至少一个发现；
- 2 家主动要求持续监控或扩大仓库范围；
- 从授权到第一份有用报告的中位时间小于 30 分钟；完整 App 前可把人工时间单独记录，不能混入产品时间。

### E2：Baseline Adoption

选择一项已有团队共识的 Skill/rule，通过 Harhub 向 5 个以上仓库形成可评审变更。

当前可以利用 Project freeze + GitHub Action 做高接触 pilot；目标形态应是 GitHub App + PR。

**成功阈值：**

- 至少 3 家完成一次多仓库 rollout；
- 目标 PR 的 merge/拒绝原因可追踪；
- 没有团队要求绕过 review 直接覆盖；
- 至少 50% 的目标仓库在一周内进入明确状态：adopted、intentional override 或 rejected，而不是 unknown。

### E3：Drift 与反向回流

等待或主动制造一个安全的 repo-specific change，验证：

- Harhub 正确识别 added/modified/missing；
- maintainer 能理解文件级 diff；
- 团队能选择保留 override、回退 baseline 或 Sync to Library；
- 决策留下 audit event。

**成功阈值：**

- 至少 3 家在四周内各处理 3 次真实 drift/adoption 事件；
- 其中至少 2 家把一项仓库改进回流或分发到第二个仓库；
- 处理时间明显低于其原有手工流程，记录前后实际分钟数；
- champion 不需要 Harhub 团队代操作第二次。

E3 是最关键的习惯测试。只有完成一次上传或 inventory，不足以证明 PMF。

### E4：质量与治理门禁

不要先自建 eval runtime。把 Skill/rule release 接到现有 CI 或 Promptfoo 等执行器，验证：

- release 是否固定输入和结果；
- 失败是否能阻止 rollout；
- reviewer 是否理解质量变化；
- 安全/policy finding 是否能映射到具体 repo 和版本。

**成功阈值：** 设计伙伴愿意为至少一个高价值 Harness 维护测试，并在失败时真的停止发布。

### E5：付费意愿

在 E2/E3 后而不是第一次访谈时测试三张价格卡：

- Team Cloud：按 active governed repositories 分档；
- Self-host：年度订阅 + 更新/支持；
- Enterprise：SSO、audit retention、policy、支持 SLA。

**初始 PMF 信号：**

- 至少 3 家愿意付费或签署带价格的 LOI；
- 付费理由明确指向持续 repo governance，而不是定制开发；
- 至少 2 家愿意扩大仓库数或引入第二位管理员。

免费继续 pilot、口头说“以后可能买”不计入付费信号。

## 5. 北极星和事件模型

### 北极星：Weekly Governed Repositories（WGR）

定义：过去 7 天内满足以下至少一项、且绑定到有效 approved baseline/release 的去重仓库：

- 上报当前 Harness inventory；
- 接受/拒绝一次 adoption 或 upgrade；
- 处理一次 drift；
- 完成一次 policy/eval check；
- 明确记录 intentional override。

WGR 比 upload、share 或 Forge generation 更接近持续价值。

### 激活漏斗

```text
Workspace created
→ Git provider connected
→ First repository inventoried
→ 5 repositories inventoried
→ Canonical asset selected
→ First adoption PR
→ First drift decision
→ Second independent weekly return
```

### 必须记录的事件

- `repository_connected`
- `inventory_completed`
- `artifact_discovered`
- `canonical_selected`
- `release_approved`
- `adoption_proposed`
- `adoption_merged`
- `adoption_rejected`
- `drift_detected`
- `override_accepted`
- `drift_resolved`
- `change_promoted_to_library`
- `policy_checked`
- `evaluation_completed`

每个事件至少包含 workspace、repository、artifact/release、actor/source、timestamp 和 outcome。敏感文件内容不应默认进入 analytics。

### 辅助指标

| 指标 | 解释 |
|---|---|
| Time to First Inventory | 授权到首份可用 inventory 的产品时间 |
| Repository Coverage | 已 reporting repos / pilot 目标 repos |
| Drift Decision Rate | 有明确决策的 drift / 全部 drift |
| Median Drift Resolution Time | 检测到明确决策的时间 |
| Cross-repo Reuse | 同一 approved release 覆盖的仓库数 |
| Four-week Team Retention | 四周内至少三周有 WGR 的 workspace |
| Champion Expansion | 新增第二位 admin/reviewer 的团队比例 |
| Outcome Evidence Coverage | 有 eval/task evidence 的 active releases 比例 |

### 反指标

- 上传很多但没有 repository binding；
- Forge generation 很多但没有 freeze/adoption；
- share/download 很高但没有团队 retention；
- drift 很多但无人处理；
- PR 很多但被批量关闭；
- 所有活跃都来自 Harhub 团队代操作。

## 6. 六周设计伙伴计划

| 周 | 工作 | 交付与决策 |
|---|---|---|
| 0 | 筛选与 E0 访谈 | 选择 5 家有真实仓库问题的团队 |
| 1 | Inventory onboarding | 5～20 repos、首份差异报告 |
| 2 | 选择 canonical baseline | 一项 Skill/rule、owner、版本和目标 repos |
| 3 | Adoption | PR/Action rollout，记录 merge/reject/override |
| 4 | Drift | 处理真实或受控 drift，验证 review loop |
| 5 | 第二次独立使用 | 不由 Harhub 团队代操作 |
| 6 | 价值复盘与价格测试 | 继续、付费、扩大、停止四种明确决策 |

不要为了维持 pilot 数量而无限提供定制功能。任何只服务一家客户的请求都先判断：它是否强化通用 repo lifecycle，还是把 Harhub 拉向 runtime、咨询或特定 Agent 私有后台。

## 7. 定价假设

### 推荐价值度量

优先测试 **active governed repositories**，而不是：

- seats：很多开发者只通过 PR 间接受益；
- Skill 数量：AI 生成会让数量失真；
- generations/tokens：与治理价值无关；
- downloads：不能代表采用。

### 待测试价格卡，而非正式价格

- 小团队 Cloud：最低月费 + 10/25 active repos；
- 成长团队：更多 active repos、review/audit、长期事件保留；
- Self-host：年度许可证/订阅，包含升级和支持；
- Enterprise：SSO/SCIM、policy、审计导出、SLA。

访谈时测试不同量级和采购路径，不应在没有三家付费证据前优化复杂 billing。

## 8. Build / Partner / Integrate

### Harhub 自建

- inventory/normalization；
- immutable version/release；
- repo binding/adoption/drift；
- review/audit；
- composition decision；
- cross-tool renderers。

### 通过集成完成

- GitHub App、PR 和 checks；
- Promptfoo/CI eval；
- Langfuse/Opik runtime evidence；
- 外部 public Skills/MCP registries；
- S3/Postgres/enterprise identity。

### 暂不做

- LLM trace backend；
- 通用 MCP hosting；
- 公共 marketplace 结算；
- 完整 coding agent；
- 自动 Skill evolution runtime。

## 9. PMF 决策门

### 继续加码

同时出现以下信号：

- 5 家完成真实仓库 onboarding；
- 至少 3 家连续四周处理 repo adoption/drift；
- 至少 2 家出现跨仓库回流/复用；
- 至少 3 家付费或签价格明确的 LOI；
- 第二次使用不需要团队代操作。

### 保持问题、调整产品

- Inventory 强，但 rollout/drift 弱：转向 Harness inventory/security posture；
- Repo workflow 强，但多资产弱：继续 Skills-first，不急于扩展 MCP；
- Eval 要求强：优先做 adapter 和 release gate，不自建 runtime；
- Self-host 是成交前提：优先修许可证、部署和数据模型。

### 停止或换方向

- 10 家合格团队中少于 3 家愿意连接 5 个仓库；
- 团队没有明确 owner，问题只发生在个人；
- drift 每季度才发生一次且无明显成本；
- Git/template repo 已足够，客户不需要 inventory/adoption 证据；
- 唯一增长来自公共 Skill 搜索和个人安装；
- 付费要求全部是一次性定制集成。

## 10. 下一轮访谈记录模板

```markdown
# Design Partner Interview

- Company / team:
- Role:
- Engineers / active repositories:
- Agents in use:
- Existing Harness artifacts:
- Current source of truth:

## Last concrete incident
- What changed?
- How many repositories/people were affected?
- How was it detected?
- Minutes/hours spent?
- Outcome?

## Governance
- Owner:
- Reviewer:
- Security veto:
- Self-host/data constraints:

## Current workflow
- Inventory:
- Distribution:
- Drift detection:
- Evaluation:
- Rollback:

## Commitment
- Repositories available for pilot:
- Champion time per week:
- Permission constraints:
- Next dated action:

## Evidence strength
- Problem happened in last 60 days: yes/no
- Existing budget/tool: yes/no
- Pilot commitment: yes/no
- Price discussed: yes/no
```

只把有日期、对象和下一步承诺的反馈当作证据。
