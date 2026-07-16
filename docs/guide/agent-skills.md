# Agent Skills

Harhub does not define a Harhub-specific Skill format. It manages the external
Agent Skills package contract.

## Package Shape

A Skill source directory contains `SKILL.md` and optional supporting files:

```text
code-review/
  SKILL.md
  references/
  scripts/
  assets/
```

Harhub stores the uploaded package and runtime management state, extracts
standard metadata, and reads preview files from the stored zip on demand.
Stored and downloaded archives follow the
[Agent Skills discovery v0.2.0](https://github.com/cloudflare/agent-skills-discovery-rfc)
archive shape: the contents of the Skill directory are placed directly at the
archive root.

```text
SKILL.md
references/
scripts/
assets/
```

Harhub rejects archives that wrap the Skill in another directory. CLI-generated
packages use the required root structure from the start.

## Validation

The local CLI and the upload API use the same standard `SKILL.md` field
validation:

- `name`
- `description`
- official optional fields

Uploaded packages must contain exactly one `SKILL.md`. Harhub also rejects zip
entries with absolute paths, drive-letter paths, null bytes, or `..` path
segments. Harhub-specific registry metadata must stay outside `SKILL.md`.

## Public Discovery

Every public share exposes an Agent Skills discovery v0.2.0 index at:

```text
/s/:token/.well-known/agent-skills/index.json
```

The index points to the standards-compatible zip download and includes its
SHA-256 digest, so compatible clients can verify the artifact before installing
it:

```bash
npx skills add https://harhub.rcpd.cc/s/<share-token>
```

## Skill Lifecycle

Typical flow:

1. Scan or upload a Skill package.
2. Validate the package.
3. Preview metadata and files.
4. Keep the uploaded Skill in a workspace catalog.
5. Explicitly create a revocable public share.
6. Send the share page to a collaborator.
7. Let the collaborator download the zip or install it with one command.

The current MVP does not yet implement a draft/reviewed/approved lifecycle.
Uploaded workspace packages are immutable: update the source directory and
upload a new zip when the Skill changes.

See [Agent Skill Sharing And Installation Loop](../10-sharing-and-installation-loop.md)
for the product decisions and remaining release-pinning work.
