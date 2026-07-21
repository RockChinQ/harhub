# Harness 市场与 PMF 研究

> 研究基线：2026-07-21。本文档集用于产品决策，不是对外营销材料。公开指标均为抓取时快照；stars、downloads、站点自报 installs 不等于活跃用户、团队留存或收入。

## 结论先行

1. **需求已经爆发，但爆发在标准、内容与安装层。** Agent Skills 标准、Anthropic/Vercel 的公开 Skills、`skills.sh`、MCP 目录和 `npx skills` 都取得了很强的公开信号。
2. **团队治理层尚无公认赢家，但已不是空白市场。** Tessl 是最直接、定位最完整的企业竞品；`iflytek/skillhub`、PromptHub 和 OpenSpace 分别从私有 Registry、本地多资产工作台、任务证据与 Skill 演化切入。
3. **没有公认爆品不等于需求弱。** 更主要的原因是管理对象不统一、Git 已是默认替代品、平台厂商控制消费入口、公共发现与企业治理的增长机制相反、质量和 ROI 又缺少统一度量。
4. **“又一个 Skill Hub”不是可守的定位。** 公开目录会被 `skills.sh`、Smithery、官方仓库和 agent 厂商吸收；私有 Skill Registry 已有更成熟的开源实现。
5. **Harhub 最值得验证的切口是 repo-native Harness GitOps。** 即围绕“团队基线进入仓库—仓库产生 drift—人工审核—优质变更回流 Library”建立持续闭环，而不是先做公共 marketplace 或继续堆生成能力。
6. **PMF 应按团队工作流验证，而不是按 stars 验证。** 真正的信号是有多个仓库的团队持续连接、处理 drift、分发已批准变更，并愿意为私有部署、审计和治理付费。

## 文档地图

- [01. 市场地图与竞品](./01-market-landscape.md)：标准、目录、Registry、PromptOps、MCP 与 Harness 治理的分层地图。
- [02. 为什么还没有公认赢家](./02-why-no-category-winner.md)：解释“需求强但品类未收敛”的结构性原因。
- [03. Harhub 产品定位](./03-harhub-positioning.md)：基于当前代码能力提出 ICP、JTBD、差异化与产品边界。
- [04. PMF 策略](./04-pmf-strategy.md)：设计伙伴、实验、指标、定价假设和停止条件。
- [05. 证据与方法](./05-evidence-and-methodology.md)：公开数据快照、来源、代码证据和局限。

## 研究方法

本次研究交叉使用：

- GitHub REST API：仓库创建时间、stars、forks、最近 push、license 等；
- 官方仓库 README、官方产品站和文档；
- npm downloads API：固定日期窗口内的包下载量；
- Harhub `main@4aa8de5` 的服务端路由、状态层、Web、CLI、测试和部署文件；
- 已有产品设计、需求、roadmap 和 MVP 文档。

判断原则：

- 产品自述只能证明定位和功能声明，不能证明留存或收入；
- stars 只能作为关注度信号，不能当作用户数；
- npm downloads 可能包含 CI、缓存、自动更新和重复安装；
- “未发现公开证据”不等于“产品一定没有该能力”；
- Harhub 的能力以代码为准，明确区分已实现、部分实现和规划。

## 建议如何使用

- 产品与路线取舍：先读 02、03；
- 寻找设计伙伴和安排访谈：直接使用 04；
- 对外引用竞品数字：必须同时引用 05 的日期和口径；
- 每 6～8 周或在 Agent Skills/MCP 标准发生重大变化时刷新证据快照。
