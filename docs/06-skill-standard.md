# Agent Skills 标准

Harhub 将 Agent Skills 作为外部标准来管理。MVP 只实现 agentskills.io 文档中的格式，不定义 Harhub 自己的 Skill 文件格式或 frontmatter convention。

## Skill 目录

Skill 是一个包含必需 `SKILL.md` 文件的目录。

```text
code-review/
  SKILL.md
  references/
  scripts/
  assets/
```

可选资源目录会被渐进式加载。Harhub 可以预览这些文件，但不定义额外的资源目录语义。

## `SKILL.md` Frontmatter

`SKILL.md` 必须以 YAML frontmatter 开头：

```yaml
---
name: code-review
description: Review code changes for correctness, regressions, and missing validation.
---
```

Harhub 按 agentskills.io spec 执行：

- `name` 必填。
- `name` 必须是小写 slug，只包含字母、数字和连字符。
- `name` 最多 64 个字符。
- `description` 必填。
- `description` 最多 1024 个字符。
- `license` 可选，必须是字符串。
- `compatibility` 可选，提供时必须是 1-500 个字符。
- `metadata` 可选，必须是 string-to-string mapping。
- `allowed-tools` 可选，必须是空格分隔的字符串。
- 父目录应与 `name` 匹配。

## Harhub Runtime State

当前 MVP 不维护 Harhub 自定义 catalog 字段。Harhub 只围绕标准 Skill 保存运行时状态：

- 从标准 frontmatter 提取的 name 和 description 等展示信息。
- validation status 和 validation issues。
- object storage reference。

文件树和内容 preview 在请求时从独立 S3 文件 prefix 中生成，不作为新的 Skill package 数据写回。标准 zip 仅在下载和 discovery 时动态生成。Uploaded workspace Skills 不支持原地 patch；更新源 Skill 后应重新导入。

后续如果需要更多 catalog 或治理能力，必须作为 Harhub 的产品数据单独设计，不能修改或包装 Agent Skills 的格式。
