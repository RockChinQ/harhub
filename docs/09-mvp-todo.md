# MVP 指标与 TODO

Harhub 的 MVP 策略是 **开源分发加 hosted SaaS 运营**。产品品类应是 **团队 AI harness 管理**：管理团队用来让 agents 可靠运行的 Skills、MCP servers、rules、project instructions 和 governance metadata。

Library 从 Agent Skills 切入，并已加入 MCP 配置的私有采用闭环。Skills
有价值，是因为它们有具体包结构、可以校验、上传、预览和公开分发；MCP
配置则提供版本、Project binding/PR 和 Forge materialization。Rules 与
instructions 尚未扩展为完整 Library lifecycle，通用 bundle composition
和 cross-tool distribution 也仍未实现。

## 目标形态

Harhub 应以两个互相关联的表面发布：

- **开源项目**：一个 self-hostable TypeScript app、CLI 和 MCP server，用于校验、编目并管理 harness assets，同时不发明自定义格式。Library 管理 Agent Skills 与私有 MCP 配置；Projects 可以盘点多类 repository harness files。
- **Hosted SaaS**：面向不想自行运维 storage、auth、catalog 和 governance infrastructure 的团队，提供免费 cloud workspace。

Hosted MVP 发布时只提供免费版。与其立即收费，不如用清晰的使用限制控制运营成本，并将超限状态作为未来 paid plan 的需求信号。

## 当前产品读数

当前代码中已经存在：

- **Fullstack app**：Express API、Vite/React frontend、shared TypeScript types 和 CLI entry point。
- **Authentication**：可配置的 email/password 自动注册登录、Google/GitHub OAuth、邮件验证码登录、bearer-token sessions、profile updates、password changes 和 logout。
- **Tenant model**：workspaces、memberships、workspace roles 和 workspace-scoped asset catalogs。
- **Workspace invitations**：owner/admin 可邀请邮箱加入 workspace、Resend 发送邀请邮件、pending invitation 可撤销、invite token 可用于登录/注册/OAuth 后进入 workspace。
- **Skill asset flow**：zip import、`SKILL.md` candidate selection、独立 S3 file-prefix storage、runtime indexing、search/filter、detail/file preview、validation、sharing、deletion、最近五版下载和 rollback。
- **Validation foundation**：local scan 和 uploaded zip 共用官方 frontmatter、name、description 和 optional-field checks；任意 zip 可以发现多个 nested Skills，同时拒绝 path traversal、absolute paths、drive-letter paths、null-byte paths 和非法候选。
- **Forge**：workspace-scoped OpenAI-compatible provider 配置与测试、适应式问题批次、NDJSON 流式 operation、自动/手动 retry、持久化 URL-bound session、framework download 和 Project freeze。
- **Projects and GitHub**：GitHub App authorization/import、repository scan snapshots、push webhook refresh、Skills/MCP/rules/instructions inventory、ownership policy、Skill fork diff/Library publish 和显式 PR proposal。
- **CLI**：覆盖 local Skills、remote Library/version/share/install、Projects、GitHub repositories 和 persistent Forge sessions，并支持 JSON/NDJSON 与 proxy environment。
- **Agent Operations MCP**：`harhub-mcp` 复用 CLI 登录，暴露 Library、Project、GitHub 和 Forge remote tools；本地路径受 allowed roots 约束，高影响操作要求显式确认。
- **Distribution foundation**：`upload --share`、share/unshare、无需登录的 `/s/:token`、标准化 zip download、Agent Skills discovery、`harhub install` 和 `npx skills add` 已形成基础协作路径。
- **Open-source release path**：Apache-2.0 license；GitHub Release 触发 npm publish workflow，使用 `NPM_TOKEN` 发布；当前 package version 为 `0.1.0-beta.5`。
- **Cloud-native persistence**：`HARHUB_DATABASE_URL` 存在时，低频状态使用兼容 JSONB snapshot；Asset versions、audit events、GitHub installations、repository connections/scans/inventory/policies/proposals 使用独立可查询 tables。每个 imported Skill version 的文件存入独立 S3-compatible prefix，源 zip 不保留。本地 `.harhub` JSON 只作为 fallback。
- **Deployment surface**：production build 由单一 Express process 提供 Web、API 和 docs；CI 强制 `npm ci → check → test → build`，image deployment 依赖 quality job 通过。
- **Cloud catalog boundary**：服务端已经移除 workspace local-path scan/create/update。Local directory discovery 只在 CLI 中执行；Library 管理 uploaded immutable Skill versions，Project scanner 则通过已授权 GitHub repository 建立独立 inventory。

如何理解当前实现：

- **Current wedge**：Skills asset management。
- **Target category**：team AI harness management。
- **Buyer/user pain**：团队需要一个地方发现、评审、校验、发布并审计 AI context；这些 context 现在散落在 Cursor rules、Claude/Codex Skills、Copilot instructions、MCP configs 和 repo-local `AGENTS.md` 中。
- **Defensible value**：跨工具兼容性、生命周期治理、策略检查、使用分析和分发工作流。这些通常不是单个 AI coding tool 能跨竞争生态解决的问题。

目标 MVP 的重要缺口：

- **Quota 尚未建模**：上传大小有 process-level cap，但没有 per-user、per-workspace、per-asset、daily upload 或 total storage quota。
- **Zip resource limits 仍不完整**：上传已经执行官方 Skill 字段校验和路径安全检查，但还没有 zip-entry count 与 uncompressed-size limits，仍需防御 zip bomb 和超大展开内容。
- **没有 activation/distribution event**：产品已有 public share、verified download、Harhub install 和通用 Agent Skills CLI install，但还没有 usage event 来证明实际复用。
- **SaaS persistence 仍需产品化**：Postgres backend 已有 Asset version 与 audit event projections，但还缺 explicit migration runner、其余 domain reporting projections、backup/export policy 和 production readiness checks。
- **没有 operations dashboard**：缺少 signups、activated workspaces、asset counts、storage usage、failed uploads、quota hits 或 over-limit users 的 admin view。
- **没有 hosted onboarding funnel**：signup 还没有引导用户完成上传或导入 3 个有效 Skills 并安装 1 个的激活路径。
- **开源发布表面仍需补齐**：README、Apache-2.0 license、CLI/MCP guides、deployment guide、`.env.example`、Dockerfile、release workflows 和 npm beta 已存在；仍缺 `CONTRIBUTING.md`、`SECURITY.md` 和完整 production runbook。

## 近期已完成

- [x] 将 Skills 与 MCP 配置统一作为 Library Asset kind 管理；Project inventory 同时识别 Rules 和 instructions，但不为后两者提供 Library mutation lifecycle。
- [x] 将前端固定到 `127.0.0.1:5176`，API 固定到 `127.0.0.1:3310`。
- [x] 支持任意 zip 多 Skill 发现与勾选导入；每个 Skill 逐文件写入独立 S3 prefix，并提供本地 MinIO 开发路径。
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
- [x] 移除 server-local Skill paths 和 path-based workspace scan/create/update；Library 只保留 uploaded assets，GitHub inventory 通过独立 Project connection 获取。
- [x] 统一 password sign-in 与 registration：新邮箱通过同一个 login flow 创建账号和初始 workspace。
- [x] 添加可撤销 public share 页面、标准化 zip download、Agent Skills discovery、CLI `--share` 和目标 Agent 安装。
- [x] 添加真实 Skill version packages：当前版和最近四个旧版可下载，rollback 会创建新版本。
- [x] 添加持久化 Forge sessions、workspace AI connection test、适应式 discovery、streaming/retry 和 Project freeze。
- [x] 添加 GitHub App repository import、multi-artifact Project inventory、push refresh、Skill fork diff/人工回流和 pull request delivery。
- [x] 添加覆盖 Library、Projects、GitHub 和 Forge 的 CLI commands 与 Agent Operations MCP tools。
- [x] 添加 MCP Library 上传/版本、Project binding/PR，以及 Forge 安全选择与原样物化。
- [x] 添加 simplified owner/admin mutation RBAC、normalized audit events 和 repository projections。
- [x] 采用 Apache-2.0 license，并让 image deployment 依赖 `check → test → build` quality workflow。

更广义 team-harness 产品的重要缺口：

- **Rules/Instructions inventory 还停留在 Project scope**：scanner 能盘点 repository Skills、MCP 配置、rules 和 agent instructions，但 rules/instructions 没有跨 Project 查询、全局 catalog 或 Library lifecycle。
- **没有 cross-tool target model**：缺少 Codex、Claude Code、Cursor、GitHub Copilot、ChatGPT、CI 或 repo materialization 的 target abstraction。
- **Governance workflow 仍是局部能力**：Asset/Project mutation 有 audit events，Project Skill forks 有人工 diff/publish，repository changes 有 proposal/PR confirmation；仍缺通用 review、approval、rollout 和 policy exception model。
- **没有 MCP risk model**：尚未表示 MCP servers、tools、scopes、environment requirements 和 secret boundaries。
- **没有 composition contract**：还不能解析 org baseline 加 team-specific 和 repo-specific harness packs，也没有 precedence 与 conflict handling。

## 北极星指标

**Activated Harness Workspace**

Workspace 在创建后 7 天内满足以下条件即为 activated：

1. 至少 **3 个有效 Skill assets**。
2. 任一 Skill 至少发生 **1 次 distribution action**。
3. 至少发生 **1 次 preview 或 validation action**。

Distribution action 可以是：

- Create public share。
- Open public share page。
- Download Skill zip。
- Copy install command。
- Complete Harhub or Agent Skills CLI install。

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
8. Create a public share。
9. A collaborator opens the share。
10. Perform first download or successful install。

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

- [x] 支持 `harhub skills upload --share`，在 upload 后立即返回 share URL。
- [x] 支持已上传 Asset 的 CLI/Web share、unshare 和 revocable public page。
- [x] Public page 提供 validation state、zip download、`harhub install` 和 `npx skills add`。
- [x] 提供 Agent Skills discovery index、archive digest 和目标 Agent 安装路径。
- [ ] 增加 immutable `AssetRelease`，让 share 固定到具体 upload snapshot，而不是 logical asset。
- [ ] 追踪 share view、download、install success/failure 和 revoke events，让 activation 可衡量。
- [ ] 在 Skills 页面添加 onboarding checklist：upload/import 3 Skills、fix validation、preview one、copy install/download once。
- [ ] 添加清晰 empty states，包含 sample Skill zip 和可复制 CLI upload 示例。
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
- [x] 将 Asset version history 与关键 Asset/Project/repository audit events 从 catalog JSONB 中拆出为可查询的 normalized tables。
- [ ] 添加 activation/distribution usage counters 与 reporting projections。
- [ ] 添加 explicit migration runner；当前应用启动时会创建所需 runtime tables。
- [ ] 添加 workspace metadata 的 backups 或 export path。

### 4. 上传校验与存储安全

- [x] 让 uploaded zips 运行与 local scanned Skills 相同的官方 `SKILL.md` validation rules。
- [x] 在 uploaded assets 上持久化 validation issues。
- [x] 根据真实 validation results 将 uploaded assets 标记为 `error`、`warning` 或 `valid`；新上传中的 error 会直接拒绝。
- [x] 拒绝 path traversal、absolute path、drive-letter path 和 null-byte zip entries。
- [ ] 添加 zip-entry count 和 uncompressed-size limits，降低 zip-bomb 风险。
- [x] 存储对象默认私有，并通过 workspace authorization 或可撤销 public share route 提供 downloads。
- [x] 当 S3 object 已经缺失时，单次 delete 仍可完成 object cleanup 和 catalog removal。

### 5. 授权与 SaaS 安全

- [x] Workspace settings、member changes、Asset mutations、Project/GitHub mutations 和 Library publish 均要求 owner/admin 权限。
- [x] 按角色允许 member/viewer read-only access；账号只能维护自己的 Forge sessions。
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

- [x] 添加 Apache-2.0 license，并在 package metadata 与 README 中声明。
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

- [x] 扫描 connected repository 中任意位置的 `SKILL.md`、`AGENTS.md`、`CLAUDE.md`、Copilot instructions、Cursor/Windsurf rules、`.harness` rules/MCP 和常见 MCP JSON。
- [x] 按 Skill、MCP、rule、instruction、format、source repository/branch/commit/path 与 ownership policy 对发现项分类。
- [x] 在 Project detail 中为 rules、instructions 和 MCP definitions 添加 read-only inventory views。
- [x] 将 MCP inventory 提升为独立 Library asset lifecycle，并支持 Project binding。
- [ ] 将 rules/instructions inventory 提升为跨 Project 查询与独立 Library asset lifecycle。
- [ ] 检测 duplicate 或 near-duplicate rules 和 instructions。
- [ ] 在实现完整 composition 前追踪每种 artifact type 的需求。

### 2. 导入来源

- [x] 通过 GitHub App installation 导入 existing repository 并建立 Project。
- [ ] 从 zip URL 通过 server-side fetch 和 validation 导入。
- [x] 扫描 connected repository，寻找任意目录下的 candidate `SKILL.md` packages。
- [x] 在 Project inventory 上保留 source repository、branch、commit、path 和 digest；从 Project publish 到 Library 时记录来源。

### 3. 版本化与发布

- [x] 添加 retained asset version records 和独立 S3 file snapshots，而不是覆盖旧对象。
- [ ] 添加 release notes 和 changelog fields。
- [ ] 展示 versions 之间的 diff。
- [x] 展示 Project Skill fork 与当前 Library version 的 file-level diff，并要求人工确认回流。
- [ ] 当 distribution actions 存在后，追踪 pinned 到某个 version 的 consumers。

### 4. 评审工作流

- [ ] 为 uploaded Skills 添加 draft/reviewed/approved lifecycle。
- [ ] 在 Skill 变为 stable 前要求 owner/admin approval。
- [ ] 添加 validation report history。
- [ ] 只在核心 activation loop 完成后添加 comments 或 review notes。

### 5. 更好的分发

- [x] 添加 CLI command，将 hosted public Skill 安装到 Codex、Claude Code、Cursor 等 Agent 目录。
- [x] 添加 authenticated current/retained-version download API；signed short-lived object URL 尚未提供。
- [x] 添加 Codex、Claude Code 等兼容 installation targets 与 `npx skills add` copy snippets。
- [x] 添加 Project-scoped GitHub Action sync token；通用 workspace automation token 尚未提供。

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

- [x] CI 执行 `npm ci`、`npm run check`、`npm test` 和 `npm run build`，deployment job 必须依赖 quality job。
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

- [x] 仓库具备 Apache-2.0 license 和清晰 roadmap。
- [ ] 添加 contribution guide 和 security policy。
- [ ] README 解释 self-hosted OSS 和 hosted SaaS 的区别。
- [ ] 本地 self-host quickstart 能从 clean checkout 跑通。
- [ ] 示例 Skills 只展示 agentskills.io 官方 `SKILL.md` 标准。
- [ ] GitHub issue templates 能收集 bug reports 和 feature requests。
- [x] npm beta 版本可以通过 GitHub Release 自动发布。

## MVP 验收标准

MVP 满足以下条件时，可以公开免费发布：

1. 用户 A 能在 10 分钟内创建 workspace、上传有效 Skill 并生成 share；未登录的用户 B 能打开 share page，并完成一次 download 或 install。
2. 对 workspace count、asset count、asset size、total storage、members 和 daily uploads 执行 quotas。
3. 团队能看到 activated workspaces、storage usage、quota hits、upload failures 和 distribution actions。
4. 开源 repo 能根据文档步骤在没有私有基础设施的情况下 self-host。
5. Imported Skill 文件默认私有；只有 workspace authorization 可预览，或通过有效且可撤销的 share token 下载动态生成的标准 zip。
6. 已实现 Library 的 Skill/MCP 生命周期，Project inventory 可以发现其他 harness 类型，同时 positioning 清楚解释更大的 team AI harness management 品类。
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
- [x] Hosted persistence interface 采用 Postgres-compatible database 与 S3-compatible object storage，具体 provider 由部署选择。
- [x] MVP 使用 built-in password/email-code auth，并支持 Google/GitHub OAuth identity。
- [x] OSS license 采用 Apache-2.0。
- [ ] Public signup 时机：open signup、invite code 或 waitlist。
- [ ] Immutable release model：share pin 到 Harhub release snapshot，还是映射到 Git tag/commit。
- [x] 第一个 non-Skill **Library lifecycle** target 采用 MCP registry 与 Project/Forge 集成。
- [ ] 下一个 Library lifecycle target：rules 还是 instructions。
