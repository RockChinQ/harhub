# Projects

Projects are durable anchors between a repository and the harness assets it
uses. A Project can come from a completed Forge framework, an existing GitHub
repository, or an empty record that is connected later.

## Create Or Import

Use one of three paths:

- From Forge, choose **Freeze as Project**. A repository is optional.
- From **Projects**, create a Project and connect `owner/repository` later.
- Choose **Import repository** to authorize the GitHub App, select an
  installation repository, create the Project, and queue its first scan.

Freezing preserves the generated framework and its selected Library Skill and
MCP bindings. Importing preserves the existing repository as the source of
truth and begins with read-only inventory.

## Repository Connections

Harhub supports two connection modes:

- **GitHub App** reads repository trees and blobs, receives signed push
  webhooks, and can optionally open explicitly confirmed pull requests.
- **GitHub Action sync** uses a Project-scoped token and the generated
  `.github/workflows/harhub-sync.yml` to report binding digests and upload
  repository Skill packages.

The GitHub App needs only metadata/content read permissions for inventory.
Contents and pull-request write permissions are required only for managed
changes. Harhub never writes directly to the default branch.

## Inventory And Ownership

The repository scanner detects standards-compliant Skills anywhere in the
repository plus supported MCP configuration, Cursor/Windsurf rules,
`AGENTS.md`, `CLAUDE.md`, and Copilot instructions. It stores source repository,
branch, commit, path, digest, files, validation, scan status, and an immutable
inventory snapshot.

Each artifact can be:

- **Library-owned**: a repository Skill or MCP configuration is bound to its
  workspace Library asset, optionally pinned to a retained version.
- **Repository-owned**: the repository remains authoritative.
- **Ignored**: Harhub records the choice but does not track it as an active
  binding.

Rules and agent instructions are currently Project inventory only. They do not
yet have the Library upload/version lifecycle available to Skills and MCP
configurations.

## Skill Forks And Library Sync

A repository Skill bound to the Library is treated as a Project-local fork.
When repository contents differ, the Project shows added, modified, and removed
files with a side-by-side, wrapping diff. Nothing is published automatically.

An owner or admin must open the review, inspect validation results and file
changes, then explicitly choose **Sync to Library**. Publishing creates a new
Library Skill version and updates the Project baseline. A missing repository
Skill does not delete the Library asset.

## Repository Changes Through Pull Requests

With GitHub App write permissions, owners and admins can stage and preview:

- Project bootstrap files.
- One or more complete Library Skill packages to add.
- One or more Library MCP configurations to add under `.harness/mcp/`.
- A Project Skill package to remove.
- A Project MCP configuration to remove.

The proposal shows exact file additions or deletions. Opening it creates a
branch from the latest scanned commit and a pull request. The change remains
pending until the pull request is merged and a later push scan reconciles the
Project.

## Retention And Failure Handling

Each Project retains the latest 20 inventory snapshots and 50 scan jobs. A scan
reads at most 25,000 tree entries, 5,000 harness files, and 20 MB. Retryable
provider failures receive up to three attempts; pushes are coalesced to the
latest queued default-branch revision. The Project page exposes scan progress,
the latest error, and manual rescan.

Archiving a Project disconnects repository tracking but does not delete its
workspace Library Skills. Deleting a Forge session likewise does not delete a
Project already frozen from it.

Deleting a Project removes its Harhub index, sync credentials, repository
connection, inventory and scan history, and Project-only Skill fork cache. It
does not delete or modify the GitHub repository or workspace Library assets.
The Project name must be entered in the page confirmation before deletion.

## CLI And MCP

Project and repository commands cover creation, connection, inventory, scans,
ownership policy, Skill diff/publish, proposals, pull requests, token rotation,
archive, and Project deletion:

```bash
harhub projects show <project-id>
harhub projects scan <project-id>
harhub projects diff <project-id> <binding-id>
harhub projects publish <project-id> <binding-id>
harhub projects delete <project-id> --yes
harhub repositories propose <project-id> add-library-skills --asset <asset-id>
harhub repositories propose <project-id> add-library-mcps --asset <asset-id>
harhub repositories propose <project-id> remove-mcp --binding <binding-id>
harhub repositories open <project-id> <proposal-id>
```

The Agent Operations MCP exposes the same authenticated operations with
explicit confirmation on publication, pull-request opening, token rotation,
archive, and Project deletion. See [GitHub Integration](./github-integration),
[CLI](./cli), and [Agent Operations MCP](./mcp).
