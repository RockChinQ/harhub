# Agent Skills 标准

Harhub 将 Agent Skills 作为外部标准来管理。MVP 应保持兼容 Codex、Claude 以及其他支持开放 Agent Skills 格式的 agent 所消费的 Skill 目录。

## Skill 目录

Skill 是一个包含必需 `SKILL.md` 文件的目录。

```text
code-review/
  SKILL.md
  references/
  scripts/
  assets/
```

可选资源目录会被渐进式加载。Harhub 可以索引这些目录是否存在，但不应把资源内容内联进 catalog metadata。

## `SKILL.md` Frontmatter

`SKILL.md` 必须以 YAML frontmatter 开头：

```yaml
---
name: code-review
description: Review code changes for correctness, regressions, and missing validation.
---
```

Harhub 强制执行的规则：

- `name` 必填。
- `name` 必须是小写 slug，只包含字母、数字和连字符。
- `name` 最多 64 个字符。
- `description` 必填。
- `description` 最多 1024 个字符。
- 父目录应与 `name` 匹配。

## MVP Catalog 字段

当前 MVP 不维护额外的 registry metadata。Harhub 只从 `SKILL.md` 读取标准字段，并在 workspace asset index 中保存管理所需的最小状态：

- name
- description
- validation status
- object storage reference
- file preview data

后续如果重新引入 owner、tags、lifecycle 或 compatibility，应作为明确的新产品能力单独设计，不混入当前 MVP 的 Skill contract。
