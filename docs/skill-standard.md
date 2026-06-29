# Agent Skills Standard

Harhub manages Agent Skills as an external standard. The MVP should stay compatible with Skill directories consumed by Codex, Claude, and other agents that support the open Agent Skills format.

## Skill Directory

A Skill is a directory with a required `SKILL.md` file.

```text
code-review/
  SKILL.md
  references/
  scripts/
  assets/
```

Optional resource folders are loaded progressively. Harhub may index their presence, but it should not inline those resources into catalog metadata.

## SKILL.md Frontmatter

`SKILL.md` must start with YAML frontmatter:

```yaml
---
name: code-review
description: Review code changes for correctness, regressions, and missing validation.
---
```

Rules enforced by Harhub:

- `name` is required.
- `name` must be a lowercase slug with letters, numbers, and hyphens.
- `name` must be 64 characters or fewer.
- `description` is required.
- `description` must be 1024 characters or fewer.
- The parent directory should match `name`.

## Harhub Metadata

Harhub-specific registry metadata belongs in `harhub.yaml`.

```yaml
apiVersion: harhub.io/v1
kind: HarnessPackage
metadata:
  name: engineering-skills
  owner: platform
  tags: [engineering]
spec:
  maturity: experimental
  compatibility:
    agents: [codex]
  artifacts:
    - type: skill
      path: code-review/SKILL.md
      tags: [review]
```

This keeps `SKILL.md` portable while still letting Harhub manage ownership, lifecycle, tags, compatibility, and catalog state.
