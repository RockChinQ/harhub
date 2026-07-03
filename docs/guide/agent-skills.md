# Agent Skills

Harhub does not define a Harhub-specific Skill format. It manages the external
Agent Skills package contract.

## Package Shape

A Skill is a directory or zip package that contains `SKILL.md`:

```text
code-review/
  SKILL.md
  references/
  scripts/
  assets/
```

Harhub stores the uploaded package and runtime management state, then extracts
metadata and preview files for workspace browsing.

## Validation

Harhub validates uploaded and scanned Skills against the standard `SKILL.md`
fields:

- `name`
- `description`
- official optional fields

Harhub-specific registry metadata must stay outside `SKILL.md`.

## Skill Lifecycle

Typical flow:

1. Scan or upload a Skill package.
2. Validate the package.
3. Preview metadata and files.
4. Keep the approved Skill in a workspace catalog.
5. Share access with workspace members.
