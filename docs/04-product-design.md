# 产品设计

> 状态说明：本章主要描述目标产品形态。当前 beta 已实现 Skills catalog、上传、校验、预览、workspace 和认证；Package releases、Bundles、Assignments、Findings、仓库接入和治理工作流仍在规划中。

## 产品形态

Harhub 应该像一个 harness registry 和控制平面，而不是通用文档管理器。

核心对象是：

- **Packages**：可复用 harness 内容的版本化单元。
- **Artifacts**：packages 内部的文件或结构化定义。
- **Profiles**：目标上下文，例如 frontend repo、backend service、infra repo、security review、design implementation 或 incident response。
- **Bundles**：为某个 target profile 解析出的 package 组合。
- **Assignments**：bundles 与 repos、teams、agents 或 workflows 之间的链接。
- **Findings**：重复、冲突、策略违规、校验失败和 drift。

## 信息架构

### 目录（Catalog）

Catalog 列出 harness packages，并展示：

- 名称和描述。
- Owner 和 maintainer team。
- 类型：rules、skill pack、MCP pack、workflow pack、baseline、composite。
- Tags：language、framework、domain、runtime、agent、risk。
- Version 和 lifecycle state。
- Validation status。
- Adoption count。

### Package 详情

每个 package 页面应展示：

- Overview 和 intended use。
- Included artifacts。
- Compatibility metadata。
- Dependencies。
- Version history。
- Validation reports。
- Consumers。
- Open findings。
- Ownership 和 review policy。

### Bundle 详情

每个 bundle 页面应展示：

- Target team、repo、profile 或 workflow。
- Selected packages 和 pinned versions。
- Effective artifact list。
- Conflict decisions 和 overrides。
- Generated files。
- Lockfile。
- Validation status。
- Upgrade recommendations。

### 仓库视图

每个 repository view 应展示：

- 在 repo 中发现的当前 harness source files。
- Assigned bundle，如果有。
- 与 resolved bundle 的 drift。
- Local overrides。
- Repo harness 所需 MCP permissions。
- 推荐 upgrades 或 deduplication actions。

## Skills-first 初期闭环

当前优先工作流不是完整 Bundle composition，而是 [Agent Skill 发布、分享与安装闭环](./10-sharing-and-installation-loop.md)：

1. Author 在本地维护标准 Skill directory。
2. Author 执行 `harhub skills upload <path> --share`。
3. Harhub 校验并存储 zip，写入 workspace catalog，并创建 revocable public share。
4. CLI 返回 `/s/:token`；Author 将链接发给协作者。
5. Collaborator 无需登录即可查看 validation 状态、下载 zip，或复制 `harhub install` / `npx skills add`。
6. Collaborator 将 Skill 安装到选定 agent；Harhub 记录 distribution outcome。
7. Author 可以撤销 share，停止 public metadata、discovery 和 download。

Upload 与 share 必须分开：普通 upload 保持 private，只有 `--share` 或显式 Share action 才对外分发。Share 最终应固定到不可变 release，而不是跟随可变 asset record。

## 核心工作流

### 1. 发现已有 Harness

1. Platform owner 连接 Git repositories，或让 Harhub 指向一组 repositories。
2. Harhub 扫描 Agent Skills 和已知 harness files。
3. Harhub 将发现的 assets 分组为候选集合。
4. Owners 评审候选项，补充 metadata，并发布到 catalog。

结果：组织获得 inventory，而不需要立即迁移。

### 2. 发布 Harness Package

这是版本化、评审和 composition 阶段的长期工作流。当前 Skills-first 发布路径以上述 share/install 闭环为准。

1. Author 在 Git 中创建或更新 harness package。
2. 发布内容引用外部标准文件、docs、artifacts 和可选 validation fixtures。
3. CI 运行 Harhub validation。
4. Reviewers 批准 package release。
5. Harhub 索引不可变版本，并让它可用于 composition。

结果：可复用 harnesses 拥有 owners、versions 和 validation status。

### 3. 组合仓库 Harness

1. Maintainer 选择 target repo 和 profile。
2. Harhub 根据 language、framework、team、existing files 和 org policy 推荐 packages。
3. Maintainer 选择 packages 和 versions。
4. Harhub 解析 dependencies，应用 precedence，并检测 conflicts。
5. Harhub 输出运行态分发记录以及 generated files 或 runtime references。

结果：repo 获得一致的 harness，不需要手动 copy-paste。

### 4. 检测并移除冗余

1. Harhub 比较 rule text、Skill purposes、MCP definitions 和 metadata。
2. 相似 artifacts 被分组为潜在 duplicates。
3. Maintainers 选择 canonical artifact，或保留有明确理由的 variants。
4. Harhub 建议 package consolidation 和 migration pull requests。

结果：团队在合理场景下收敛到共享 harnesses，同时保留有正当理由的本地差异。

### 5. 发布 Org Baseline

1. Platform owner 发布 baseline package。
2. Harhub 展示 affected repos 和 incompatible packages。
3. Teams 针对 repo profiles 测试 baseline。
4. Harhub 打开 upgrade pull requests，或更新 bundle assignments。
5. Dashboards 追踪 adoption 和 exceptions。

结果：组织级 agent standards 可以安全且可见地发布。

### 6. 评审高风险 Harness 变更

1. Package update 增加新的 MCP server 或扩大 tool permissions。
2. Harhub 将变更分类为 risky。
3. Security reviewers 查看 permission diff、affected consumers 和 validation results。
4. 变更被批准、拒绝，或通过带 scope 的 exception 放行。

结果：harness capabilities 在进入 agents 前被治理。

## Agent Skills 结构

Harhub 当前只管理 agentskills.io 定义的 Skill 目录或 zip：

```text
skill-name/
  SKILL.md
  scripts/
  references/
  assets/
```

Harhub 当前不定义任何新的 Skill 文件格式。仓库中的其他 harness files 可以作为未来资产类型被发现和治理，但不能被包装成新的 Skill 标准。

## 组合模型

Harness composition 应显式且可解释。

推荐默认层级：

1. Organization baseline。
2. Domain 或 function pack。
3. Team pack。
4. Repository pack。
5. Workflow pack。
6. Local override，如果 policy 允许。

每个 resolved bundle 都应包含：

- Input packages 和 versions。
- Effective artifact order。
- Applied merge strategies。
- Conflict decisions。
- Policy exceptions。
- Output files 或 runtime references。
- Validation result。

## 分发模式

### 引用模式（Reference Mode）

Repository 可以保存普通配置文件来指向 Harhub 中的 resolved bundle，但这些文件不改变 Agent Skills 的格式。

适合：

- 能在启动时拉取 harnesses 的 agent runtimes。
- 希望减少 generated files 的团队。
- 集中式策略执行。

### 实体化模式（Materialized Mode）

Harhub 将 `AGENTS.md`、`DESIGN.md`、`ARCHITECTURE.md` 和 MCP config 等 generated files 写入 repository。

适合：

- 只能读取本地文件的工具。
- 希望所有 agent instructions 在 Git 中可见的团队。
- 离线或受限环境。

### 混合模式（Hybrid Mode）

Repository 保留关键 generated files，并用运行态记录保存 Harhub provenance。

适合：

- 渐进采用。
- 混合 agent tooling。
- 希望兼顾本地透明性和中心化管理的团队。

## 用户体验原则

- 到处展示 provenance。
- 让 effective harness 易于检查。
- 早期采用阶段优先推荐，而不是强制迁移。
- 将 conflicts 视为可评审决策，而不是隐藏的实现细节。
- 让高风险 capability changes 在视觉上明显。
- 保持 package authoring 对 Markdown 和 Git 友好。
