# GitHub Integration

Harhub can import an existing GitHub repository directly into **Projects**. The
initial connection is read-only: Harhub inventories supported harness files,
keeps immutable scan snapshots, and refreshes the Project after pushes to the
default branch. A repository does not need a workflow or Project sync secret.

## Create the GitHub App

Create a GitHub App owned by the account that operates the Harhub instance.
Configure these URLs using the public Harhub origin:

```text
Setup URL:          https://harhub.example.com/api/github/installations/callback
Callback URL:       https://harhub.example.com/api/github/installations/callback
Webhook URL:        https://harhub.example.com/api/github/webhooks
```

Enable **Request user authorization (OAuth) during installation** only if the
provider setup supports it. Harhub always performs its own OAuth proof after the
setup callback before linking an installation to a workspace.

Repository permissions for read-only inventory:

- Metadata: read
- Contents: read

Subscribe to `push`, `installation`, `installation_repositories`, `repository`,
and `pull_request` events.
Harhub verifies every webhook with `X-Hub-Signature-256` and deduplicates the
GitHub delivery ID before queueing a scan.

Optional managed change pull requests additionally require:

- Contents: write
- Pull requests: write

These write permissions are not needed to import or continuously observe a
repository. Harhub never writes during initial onboarding. When write access is
available, an administrator can preview and explicitly open pull requests that:

- add `.harhub/project.json`;
- copy selected complete Skill packages from the workspace Library into the
  Project repository;
- remove a Project Skill package without deleting its workspace Library asset.

Harhub creates a branch from the latest scanned commit and shows the exact file
additions or deletions before opening the pull request. It never writes directly
to the default branch.

## Server configuration

Set the GitHub App credentials on the Harhub server:

```bash
HARHUB_PUBLIC_URL=https://harhub.example.com
HARHUB_GITHUB_APP_ID=123456
HARHUB_GITHUB_APP_SLUG=harhub-example
HARHUB_GITHUB_APP_CLIENT_ID=Iv1.example
HARHUB_GITHUB_APP_CLIENT_SECRET=...
HARHUB_GITHUB_APP_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
HARHUB_GITHUB_WEBHOOK_SECRET=...
```

`HARHUB_GITHUB_APP_PRIVATE_KEY` accepts PEM text with escaped newlines or a
base64-encoded PEM. Keep the private key, client secret, and webhook secret in
the deployment secret manager. They are never sent to the browser or stored in
workspace state.

## Import flow

From **Projects**, choose **Import repository**:

1. Install or select a workspace GitHub App installation.
2. Select an accessible repository.
3. Harhub creates a Project and queues the initial default-branch scan.
4. Review each detected Skill, MCP configuration, Rule, or agent instruction.
5. Keep it repository-owned, bind a matched Skill to the Library, or ignore it.

Skill discovery is directory-agnostic: every exact `SKILL.md` is treated as a
Skill package root, including a repository-root Skill, conventional tool folders
such as `.agents/skills` or `.claude/skills`, and arbitrary monorepo paths.
Nested Skill roots remain separate packages. Dependency, cache, VCS, and generated
output directories such as `node_modules`, `.venv`, `dist`, `build`, and `target`
are excluded from discovery and package contents.

Repository Skills are stored as Project-local forks. A changed fork can be
reviewed file by file and only reaches the workspace Library after an explicit
**Sync to Library** confirmation.

The **Project Skills** section supports searching the current repository Skills,
adding one or more valid Library Skills, and removing a current Project Skill.
Add and remove actions always remain pending until their GitHub pull request is
merged; the subsequent push webhook and inventory scan reconcile Project state.

## Limits and retention

Harhub scans at most 25,000 repository tree entries and downloads at most 5,000
harness files or 20 MB per scan. It retains the latest 20 inventory snapshots
and 50 scan jobs per Project. Repository source outside detected harness assets
is neither downloaded nor retained.

Failed provider requests use bounded automatic retries. The latest failure is
shown on the Project and a workspace administrator can manually rescan. Pushes
are coalesced so only the latest queued default-branch revision remains pending.
