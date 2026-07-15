# MVP 指标与 TODO

Harhub 的 MVP 策略是 **开源分发加 hosted SaaS 运营**。产品品类应是 **团队 AI harness 管理**：管理团队用来让 agents 可靠运行的 Skills、MCP servers、rules、project instructions 和 governance metadata。

第一版实现应继续聚焦 Agent Skills，但这是切入点，不是最终品类。Skills 有价值，是因为它们有具体包结构、可以校验、可以上传和预览，并能形成可衡量的复用闭环。只有在 Skills 闭环被验证后，更大的产品才应扩展到 rules、MCP governance、bundle composition、PR automation 和 cross-tool distribution。

## 目标形态

Harhub 应以两个互相关联的表面发布：

- **开源项目**：一个 self-hostable TypeScript app 和 CLI，用于校验、编目并管理 harness assets，同时不发明自定义格式。MVP 实现只管理 Agent Skills。
- **Hosted SaaS**：面向不想自行运维 storage、auth、catalog 和 governance infrastructure 的团队，提供免费 cloud workspace。

Hosted MVP 发布时只提供免费版。与其立即收费，不如用清晰的使用限制控制运营成本，并将超限状态作为未来 paid plan 的需求信号。

## 当前产品读数

当前代码中已经存在：

- **Fullstack app**：Express API、Vite/React frontend、shared TypeScript types 和 CLI entry point。
- **Authentication**：可配置的 email/password 自动注册登录、Google/GitHub OAuth、邮件验证码登录、bearer-token sessions、profile updates、password changes 和 logout。
- **Tenant model**：workspaces、memberships、workspace roles 和 workspace-scoped asset catalogs。
- **Workspace invitations**：owner/admin 可邀请邮箱加入 workspace、Resend 发送邀请邮件、pending invitation 可撤销、invite token 可用于登录/注册/OAuth 后进入 workspace。
- **Skill asset flow**：S3-compatible zip upload、`SKILL.md` extraction、runtime indexing、search/filter、table view、detail view、file tree preview 和 deletion。
- **Validation foundation**：local scan 和 uploaded zip 共用官方 frontmatter、name、description 和 optional-field checks；upload 还会拒绝多个 `SKILL.md`、path traversal、absolute paths、drive-letter paths 和 null-byte paths。
- **CLI foundation**：local scan、validate、list、show、create、asset scan、asset validate、asset create、interactive TUI upload、local Skill directory packaging 和 API-backed zip upload。
- **Open-source release path**：GitHub Release 触发 npm publish workflow，使用 `NPM_TOKEN` 发布；`0.1.0-beta.3` 是当前 npm beta 版本。
- **Cloud-native persistence**：`HARHUB_DATABASE_URL` 存在时，accounts、sessions、workspace metadata、memberships 和 workspace asset indexes 存入 Postgres-compatible database；uploaded zip bytes 存入 S3-compatible object storage。本地 `.harhub` JSON 只作为 fallback。
- **Deployment surface**：production build 由单一 Express process 提供 Web、API 和 docs；仓库包含 multi-stage Dockerfile、Docker image workflow 和 VitePress 文档站。
- **Cloud catalog boundary**：服务端已经移除 local path scan/create/update。Local directory discovery 只在 CLI 中执行，hosted workspace catalog 只管理 uploaded immutable zip packages。

如何理解当前实现：

- **Current wedge**：Skills asset management。
- **Target category**：team AI harness management。
- **Buyer/user pain**：团队需要一个地方发现、评审、校验、发布并审计 AI context；这些 context 现在散落在 Cursor rules、Claude/Codex Skills、Copilot instructions、MCP configs 和 repo-local `AGENTS.md` 中。
- **Defensible value**：跨工具兼容性、生命周期治理、策略检查、使用分析和分发工作流。这些通常不是单个 AI coding tool 能跨竞争生态解决的问题。

目标 MVP 的重要缺口：

- **Quota 尚未建模**：上传大小有 process-level cap，但没有 per-user、per-workspace、per-asset、daily upload 或 total storage quota。
- **Zip resource limits 仍不完整**：上传已经执行官方 Skill 字段校验和路径安全检查，但还没有 zip-entry count 与 uncompressed-size limits，仍需防御 zip bomb 和超大展开内容。
- **没有 activation/distribution event**：产品已有 public share、download 和 copy install command，但还没有 usage event 或 copy Codex install path 来证明复用。
- **SaaS persistence 仍需产品化**：Postgres backend 已可用，但还缺 explicit migration runner、normalized reporting schema、backup/export policy 和 production readiness checks。
- **没有 operations dashboard**：缺少 signups、activated workspaces、asset counts、storage usage、failed uploads、quota hits 或 over-limit users 的 admin view。
- **Role enforcement 不完整**：很多 asset actions 只要求 workspace access；hosted SaaS 应按角色显式限制 mutation。
- **没有 hosted onboarding funnel**：signup 还没有引导用户完成上传或导入 3 个有效 Skills 并安装 1 个的激活路径。
- **开源发布表面仍需补齐**：README、CLI quickstart、deployment guide、`.env.example`、Dockerfile、release workflows 和 npm beta 已存在；仍缺 license、`CONTRIBUTING.md`、`SECURITY.md`、完整 production runbook 和更清晰的 OSS/SaaS 边界说明。

## 近期已完成

- [x] 将 Skills 统一作为 Asset kind 管理，并保留 MCPs、Rules 为 disabled roadmap entries。
- [x] 将前端固定到 `127.0.0.1:5176`，API 固定到 `127.0.0.1:3310`。
- [x] 将 Skill zip upload 接到 S3/S3-compatible storage，并提供本地 MinIO 开发路径。
- [x] 将 Skill detail 做成 URL-addressable 页面，支持 file tree 和 file preview。
- [x] 将 destructive confirmation 改为 shadcn AlertDialog，避免原生 confirm。
- [x] 清理 Harhub-only Skill frontmatter，保持 `SKILL.md` 对齐 agentskills.io。
- [x] 修复 selected asset validation，避免 detail 页泄漏其他 assets 的 validation issues。
- [x] 增加 `harhub skills upload`：默认扫描本地目录，打开 TUI 选择要上传的 Skill 目录，并自动打包上传。
- [x] 增加 `--all`/`--json` 非交互上传路径，支持脚本和 CI。
- [x] 添加 GitHub Release 到 npm 的发布 workflow，使用 `NPM_TOKEN`。
- [x] 发布 `harhub@0.1.0-beta.0` 到 npm，并设置 `beta` dist-tag。
- [x] 添加 Postgres-compatible runtime state backend：accounts、sessions、workspaces、memberships 和 asset catalogs 不再必须依赖本地 JSON。
- [x] 更新本地云原生开发栈：Docker Compose 启动 Postgres + MinIO，`npm run dev:cloud` 使用同一套环境变量形态。
- [x] 添加 multi-stage Dockerfile，并通过 GitHub Actions 构建 `latest` 和 commit-SHA image tags。
- [x] 移除 server-local Skill paths 和 path-based workspace scan/create/update；cloud catalog 只保留 uploaded assets。
- [x] 统一 password sign-in 与 registration：新邮箱通过同一个 login flow 创建账号和初始 workspace。
- [x] 添加可撤销 public share 页面、公开 zip download、CLI `--share` 和下载到当前目录的 `harhub install`。

更广义 team-harness 产品的重要缺口：

- **没有 multi-artifact inventory**：当前 scanner 是 Skills-first，不会盘点 `.cursor/rules`、`AGENTS.md`、Copilot instructions、MCP definitions、prompt files 或 workflow docs。
- **没有 cross-tool target model**：缺少 Codex、Claude Code、Cursor、GitHub Copilot、ChatGPT、CI 或 repo materialization 的 target abstraction。
- **没有 governance workflow**：缺少 harness changes 的 review、approval、audit、rollout、rollback 或 policy exception model。
- **没有 MCP risk model**：尚未表示 MCP servers、tools、scopes、environment requirements 和 secret boundaries。
- **没有 composition contract**：还不能解析 org baseline 加 team-specific 和 repo-specific harness packs，也没有 precedence 与 conflict handling。

## 北极星指标

**Activated Harness Workspace**

Workspace 在创建后 7 天内满足以下条件即为 activated：

1. 至少 **3 个有效 Skill assets**。
2. 任一 Skill 至少发生 **1 次 distribution action**。
3. 至少发生 **1 次 preview 或 validation action**。

Distribution action 可以是：

- Download skill zip。
- Copy install command。
- Copy target install path。
- Copy hosted asset URL，如果后续启用 public sharing。

这个指标比 signup count 更准确，因为它证明核心闭环：harness supply、validation trust、catalog discovery 和 practical reuse。

## 支撑指标

### 激活漏斗

追踪以下转化：

1. Visit SaaS landing page。
2. Sign up。
3. Create or enter workspace。
4. Upload or import first Skill。
5. Pass validation。
6. Reach 3 valid Skills。
7. Preview a Skill。
8. Perform first distribution action。

### 供给与质量

- 每个 activated workspace 的 valid Skill assets。
- Upload/import success rate。
- Validation pass rate。
- Top validation error codes。
- Official validation error count。
- Uploaded package count。
- Previewed asset count。

### 使用与留存

- Weekly active workspaces。
- Week-2 activated workspace retention。
- Skill preview count。
- Distribution action count。
- Repeat upload/import count。
- 首次 activation 后仍会 update 或 delete assets 的 workspaces。

### 开源漏斗

- GitHub visitors、stars、forks 和 issues。
- Docs quickstart completions。
- CLI install/download attempts。
- Self-host deployment attempts。
- README/docs 到 SaaS signup 的点击。

### Harness 管理需求

- 用户尝试手动添加的非 Skill harness artifacts 数量。
- 对 Cursor rules、`AGENTS.md`、Copilot instructions 或 MCP config support 的请求。
- 询问 approval、audit、rollout、rollback 或 org-baseline features 的团队数量。
- 使用多个 agent tools 的 workspaces 数量。

### 成本护栏

- 每个 workspace 的 storage bytes。
- 每个 workspace 的 asset count。
- 平均 uploaded zip size。
- 每个用户每天的 upload attempts。
- 按原因统计 failed uploads。
- Quota hit count。
- Object storage cost estimate。

## 免费版限制

初始 hosted-free limits：

- **Users**：1 个 account 最多创建 3 个 workspaces。
- **Workspaces**：1 个 workspace 最多存储 50 个 assets。
- **Storage**：1 个 workspace 最多存储 500 MB。
- **Asset size**：单个 uploaded zip 最大 10 MB。
- **Upload rate**：1 个 account 每天最多上传 100 个文件。
- **Members**：1 个 workspace 最多 5 个 members。

超限行为：

- 尽量在上传到 object storage 前阻止 write action。
- 展示精确限制、当前用量和修复方式。
- MVP 中提供 “join waitlist” 或 “contact us”，而不是 paid checkout。
- 超限时仍允许 reads、preview、download 和 delete。

## P0 发布 TODO

### 1. 产品激活闭环

- [ ] 在 Skills 页面添加 onboarding checklist：upload/import 3 Skills、fix validation、preview one、copy install/download once。
- [ ] 添加清晰 empty states，包含 sample Skill zip 和可复制 CLI upload 示例。
- [x] 在 Skill detail 上添加一等 distribution action：public share、download zip 和 copy install instructions。
- [ ] 追踪 distribution events，让 activation 可衡量。
- [ ] 在 workspace 级展示 activation progress。

### 2. Quota 与用量执行

- [ ] 添加 workspace storage bytes、asset count、member count 和 daily upload count 的 usage fields。
- [ ] 在创建 workspaces、添加 members 或接受 uploads 前执行免费限制。
- [ ] 将 hosted upload cap 降到 10 MB，同时保留 self-host 环境变量 override。
- [ ] 上传和删除后重新计算 usage。
- [ ] 在 workspace settings 和 upload UI 中添加可见 quota meters。
- [ ] 添加带 machine-readable codes 的 quota-specific API errors。

### 3. Hosted SaaS 持久化

- [x] 为 SaaS deployments 用 Postgres-compatible hosted database 替换 local JSON state。
- [x] 保留 local JSON 作为 self-host/dev adapter。
- [x] 在数据库中存储 accounts、sessions、workspaces、memberships、asset runtime records 和 validation issues。
- [ ] 将 usage counters 和 events 从 catalog JSONB 中拆出为可查询的 normalized tables。
- [ ] 添加 explicit migration runner；当前应用启动时会创建所需 runtime tables。
- [ ] 添加 workspace metadata 的 backups 或 export path。

### 4. 上传校验与存储安全

- [x] 让 uploaded zips 运行与 local scanned Skills 相同的官方 `SKILL.md` validation rules。
- [x] 在 uploaded assets 上持久化 validation issues。
- [x] 根据真实 validation results 将 uploaded assets 标记为 `error`、`warning` 或 `valid`；新上传中的 error 会直接拒绝。
- [x] 拒绝 path traversal、absolute path、drive-letter path 和 null-byte zip entries。
- [ ] 添加 zip-entry count 和 uncompressed-size limits，降低 zip-bomb 风险。
- [ ] 存储对象默认私有，并通过 authorized API routes 提供 downloads。
- [x] 当 S3 object 已经缺失时，单次 delete 仍可完成 object cleanup 和 catalog removal。

### 5. 授权与 SaaS 安全

- [ ] Workspace settings、member changes、uploads 和 deletes 均要求 owner/admin 权限。
- [ ] 按角色允许 member/viewer read-only access。
- [ ] 为 auth 和 upload endpoints 添加 rate limiting。
- [x] 添加邮件验证码登录，使用 Resend 发送一次性 code。
- [x] 添加 Google/GitHub OAuth 登录，并绑定 provider identity。
- [x] 添加 workspace invitation token flow，支持登录/注册/OAuth 后加入 workspace。
- [ ] 在 broad public signup 前添加明确的 MVP invite-code gate 或 signup allowlist。
- [ ] 添加 password reset，或在计划很快使用外部 auth provider 时文档化临时 auth。
- [ ] 添加 request logging，包含 workspace/account IDs 且不记录 secrets。

### 6. 指标与运营

- [ ] 定义 event schema：signup、workspace created、upload started、upload failed、upload succeeded、validation failed、preview opened、install copied、zip downloaded、quota hit 和 delete。
- [ ] 添加 internal admin page 或 script，用于 activation、storage、quota 和 failed-upload reports。
- [ ] 添加 weekly metric export：activated workspaces、valid assets、distribution actions 和 W2 retention。
- [ ] 对 upload failure spikes 和 storage growth 做 alert。
- [ ] 用 UTM parameters 追踪 GitHub-to-SaaS funnel links。

### 7. 开源发布准备

- [ ] 添加 license file 并确认预期 OSS license。
- [x] 添加 `.env.example`，包含 local API、Postgres、S3/R2/MinIO、max upload bytes 和 state adapter。
- [x] 添加 production Dockerfile、image build workflow 和基本 Docker deployment 文档。
- [ ] 将 README 拆分为 quickstart、self-hosting、hosted SaaS、CLI 和 development sections。
- [ ] 添加 `CONTRIBUTING.md`，包含 local setup、checks 和 skill-standard expectations。
- [ ] 添加 `SECURITY.md`，用于 vulnerability reports 和 secret-handling expectations。
- [ ] 添加用于 demos 和 tests 的 example Skill zip fixtures。
- [x] 添加 npm 发布 workflow：GitHub Release 发布时运行 check、build、pack dry-run 和 npm publish。
- [x] 为 npm package 添加 repository、homepage、bugs、files whitelist 和 public publish config。
- [x] 发布首个 beta 包 `harhub@0.1.0-beta.0`。

## P1 TODO

### 1. Skills 之外的 Harness 盘点

- [ ] 扫描配置仓库中的 `.cursor/rules`、`AGENTS.md`、`.github/copilot-instructions.md`、prompt files、MCP config files 和 known harness directories。
- [ ] 按 artifact type、owner、source repo 和 compatibility target 对发现的文件分类。
- [ ] 在添加 mutation workflows 前，为 rules、instructions 和 MCP definitions 添加 read-only catalog views。
- [ ] 检测 duplicate 或 near-duplicate rules 和 instructions。
- [ ] 在实现完整 composition 前追踪每种 artifact type 的需求。

### 2. 导入来源

- [ ] 从 GitHub repository path 导入 Skill。
- [ ] 从 zip URL 通过 server-side fetch 和 validation 导入。
- [ ] 扫描 connected repository，寻找 candidate `SKILL.md` files。
- [ ] 在 imported assets 上保留 source repo、branch、commit 和 path。

### 3. 版本化与发布

- [ ] 添加 asset version records，而不是覆盖同一个 logical asset。
- [ ] 添加 release notes 和 changelog fields。
- [ ] 展示 versions 之间的 diff。
- [ ] 当 distribution actions 存在后，追踪 pinned 到某个 version 的 consumers。

### 4. 评审工作流

- [ ] 为 uploaded Skills 添加 draft/reviewed/approved lifecycle。
- [ ] 在 Skill 变为 stable 前要求 owner/admin approval。
- [ ] 添加 validation report history。
- [ ] 只在核心 activation loop 完成后添加 comments 或 review notes。

### 5. 更好的分发

- [ ] 添加 CLI command，将 hosted Skill 安装到本地 Codex skills directory。
- [ ] 添加 signed short-lived download URLs 或基于 API-token 的 download。
- [ ] 添加 Codex 和 Claude-compatible installation paths 的 copy snippets。
- [ ] 添加用于 CI 或 automation 的 workspace API tokens。

### 6. MCP 与 Rules 治理

- [ ] 建模 MCP server metadata、tool scopes、required environment variables、install targets 和 risk labels。
- [ ] 添加 forbidden tools、secret-like values、missing env var declarations 和 unaudited high-risk MCP access 的 policy checks。
- [ ] 添加 Cursor、Codex `AGENTS.md`、Copilot instructions 和 generic Markdown instructions 的 rules package metadata。
- [ ] 为每个 supported agent surface 定义 target-specific rendering rules。

## 发布清单

### 产品

- [ ] 新用户无需帮助即可注册。
- [ ] 新用户可以创建 workspace。
- [ ] 新用户能在 10 分钟内上传 3 个有效 Skills。
- [ ] 用户可以看到 validation status，并修复明显问题。
- [ ] 用户可以预览 `SKILL.md` 和打包文件。
- [ ] 用户可以下载 Skill，或复制安装说明。
- [ ] 用户在遇到硬性拦截前能理解 quota usage。
- [ ] 产品文案明确说明 Skills 是通向更广义 AI harness management 的第一个切入点。

### 工程

- [ ] `npm run check` passes。
- [ ] `npm run build` passes。
- [ ] 上传测试覆盖缺失 `SKILL.md`、invalid official frontmatter、too-large zip、path traversal、quota exceeded 和 S3 failure rollback。
- [ ] 认证测试覆盖 password login 自动注册、禁用 password login、logout、role-gated reads、role-gated writes，以及 password change 后 session invalidation。
- [ ] 删除测试覆盖 asset index removal、S3 deletion 和 missing-object recovery。
- [ ] SaaS 数据库迁移可以从空数据库重复执行。

### 运营

- [ ] 托管对象存储 bucket 默认私有。
- [ ] 生产环境变量有文档，并在启动时检查。
- [ ] 管理员可以看到 workspaces、users、asset count、storage bytes、quota hits 和 upload failures。
- [ ] 错误日志包含足够调试上下文，但不暴露 zip contents 或 secrets。
- [ ] Metadata 有 backups 或 exports。
- [ ] Public signup 前具备 terms/privacy pages 或临时 MVP 等价物。

### 开源

- [ ] 仓库具备 license、contribution guide、security policy 和清晰 roadmap。
- [ ] README 解释 self-hosted OSS 和 hosted SaaS 的区别。
- [ ] 本地 self-host quickstart 能从 clean checkout 跑通。
- [ ] 示例 Skills 只展示 agentskills.io 官方 `SKILL.md` 标准。
- [ ] GitHub issue templates 能收集 bug reports 和 feature requests。
- [x] npm beta 版本可以通过 GitHub Release 自动发布。

## MVP 验收标准

MVP 满足以下条件时，可以公开免费发布：

1. 一个新的外部用户能在 10 分钟内创建 hosted account、创建 workspace、上传 3 个有效 Skills、预览其中一个，并完成一次 distribution action。
2. 对 workspace count、asset count、asset size、total storage、members 和 daily uploads 执行 quotas。
3. 团队能看到 activated workspaces、storage usage、quota hits、upload failures 和 distribution actions。
4. 开源 repo 能根据文档步骤在没有私有基础设施的情况下 self-host。
5. Uploaded Skill zips 默认私有，并且只能通过 authorized routes 下载。
6. 已实现产品保持 Skills-only，同时 positioning 清楚解释更大的 team AI harness management 品类。
7. 在使用或评审 Skills MVP 后，至少 5 个团队明确请求支持 rules、MCP、`AGENTS.md`、Copilot instructions 或 cross-tool distribution。

## 前四周里程碑

目标：

- 10 个 activated hosted workspaces。
- 至少 3 个来自非熟人外部用户的 activated workspaces。
- 30+ 个 valid Skill assets。
- 10+ 次 distribution actions。
- 排除刻意 invalid-file tests 后，upload failure rate 低于 10%。

如果没有达到该里程碑，按以下顺序检查 funnel：

1. 用户是否理解 Skill 是什么？
2. 他们能否找到或创建 3 个值得上传的 Skills？
3. Validation errors 是在阻塞还是在教学？
4. Installation/download 是否足够有用，可以被视为 reuse？
5. Quota limits 是太紧，还是只是表达不清？
6. 问题是否过窄，因为用户更急需 rules/MCP/instructions management，而不是 Skills storage？

## 待决策事项

- [ ] 最终 free-plan limits。
- [ ] Hosted database 选择。
- [ ] Hosted object storage provider 选择。
- [ ] MVP 使用 auth provider 还是 built-in auth。
- [ ] OSS license。
- [ ] Public signup 时机：open signup、invite code 或 waitlist。
- [ ] 第一个 distribution target：Codex local skills path、Claude-compatible path 或 generic zip download。
- [ ] 第一个 non-Skill expansion target：Cursor rules、`AGENTS.md`、Copilot instructions 或 MCP registry/governance。
