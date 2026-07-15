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

Harhub stores the uploaded package and runtime management state, extracts
standard metadata, and reads preview files from the stored zip on demand.

## Validation

The local CLI and the upload API use the same standard `SKILL.md` field
validation:

- `name`
- `description`
- official optional fields

Uploaded packages must contain exactly one `SKILL.md`. Harhub also rejects zip
entries with absolute paths, drive-letter paths, null bytes, or `..` path
segments. Harhub-specific registry metadata must stay outside `SKILL.md`.

## Skill Lifecycle

Typical flow:

1. Scan or upload a Skill package.
2. Validate the package.
3. Preview metadata and files.
4. Keep the uploaded Skill in a workspace catalog.
5. Share access with workspace members.

The current MVP does not yet implement a draft/reviewed/approved lifecycle.
Uploaded workspace packages are immutable: update the source directory and
upload a new zip when the Skill changes.
