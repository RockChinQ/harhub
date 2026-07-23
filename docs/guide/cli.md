# CLI

The Harhub CLI manages local Agent Skills, workspace assets, projects, GitHub repositories, and Forge sessions.

## Install

Install the current beta from npm:

```bash
npm install -g harhub@beta
```

To install from a source checkout instead:

```bash
npm install
npm run build
npm install -g .
```

## Sign In

The CLI defaults to the hosted service:

```text
https://harhub.rcpd.cc
```

Sign in with OAuth 2.0 device authorization:

```bash
harhub login
```

The CLI shows a short code, opens the browser verification page, and waits for
you to approve access with your existing Harhub account. If the account belongs
to multiple workspaces, choose the default workspace once. The access token and
workspace are then reused by remote commands.

For a local or self-managed server:

```bash
harhub login --url http://127.0.0.1:3310
```

Commands without `--url` target `https://harhub.rcpd.cc`. When using a
self-managed server, pass the same `--url` on later commands; the CLI reuses that
server's saved token and workspace. Use `--no-browser` when the CLI cannot launch
a browser automatically.

```bash
harhub whoami
harhub logout
```

On Linux and macOS, the config is stored under
`$XDG_CONFIG_HOME/harhub/config.json` or `~/.config/harhub/config.json` with
user-only permissions. Set `HARHUB_CONFIG` to override that path. Command-line
token and workspace flags take precedence over `HARHUB_WORKSPACE_ID` and
`HARHUB_TOKEN`, which in turn take precedence over the saved login. Server
selection changes only with an explicit `--url`.

The CLI automatically honors uppercase and lowercase `HTTP_PROXY`,
`HTTPS_PROXY`, and `NO_PROXY` environment variables. A transient network failure
while polling an approved device is retried until the device authorization
expires.

## Short Options

Harhub business commands continue to use descriptive long options. The common
parser maps conventional short aliases before dispatching them:

| Short | Long | Short | Long |
| --- | --- | --- | --- |
| `-h` | `--help` | `-y` | `--yes` |
| `-g` | `--global` | `-j` | `--json` |
| `-r` | `--remote` | `-a` | `--all` |
| `-o` | `--output` | `-d` | `--description` |
| `-b` | `--branch` | `-f` | `--file` |
| `-c` | `--content` | `-v` | `--version` |
| `-w` | `--workspace` | `-t` | `--token` |
| `-u` | `--url` | | |

Boolean aliases can be grouped, for example `-ygr`. Value aliases support both
`-o result.zip` and `-o=result.zip`. Use `--` before positional values that begin
with `-`.

## Local Skills

```bash
harhub skills scan [paths...]
harhub skills validate [paths...]
harhub skills list
harhub skills show <id|name|slug>
harhub skills create <name> [--dir skills] [--description text]
harhub skills update <id|name|slug> --description text
harhub skills delete <id|name|slug>
```

These commands operate on local paths or `.harhub` indexes. The server does not
scan local paths on its own.

## Upload Skills

Open the interactive selector:

```bash
harhub skills upload
```

Scan a specific repository or upload every valid discovered Skill without the
selector:

```bash
harhub skills upload /path/to/repo
harhub skills upload /path/to/repo --all
```

Add `--share` to create a public link for every successful upload:

```bash
harhub skills upload /path/to/repo --all --share
```

`harhub assets upload <zip>` accepts repository exports and other arbitrary ZIP
layouts. It recursively finds every `SKILL.md` and imports all valid candidates.
Harhub stores imported Skills independently and generates standard downloadable
archives with `SKILL.md` at the root.

## Remote Assets And Skills

Local `list` and `show` behavior remains unchanged. Add `--remote` to query the
configured workspace:

```bash
harhub assets list --remote
harhub assets show <id|name|slug> --remote
harhub skills list --remote
harhub skills show <id|name|slug> --remote
```

Specifying `--workspace` also selects remote behavior. Add `--json` for machine
readable output.

Workspace asset versions are immutable. `skills edit` downloads the current
package, replaces one file, validates the full Skill archive, and uploads the
result as a new version:

```bash
# Open SKILL.md in $VISUAL or $EDITOR
harhub skills edit <id|name|slug>

# Replace a linked file from disk
harhub skills edit <id|name|slug> --file references/api.md --content-file ./api.md

# Non-interactive content replacement
harhub skills edit <id|name|slug> --file SKILL.md --content "$markdown"
```

Use the standalone download command for any workspace asset:

```bash
harhub download <id|name|slug>
harhub download <id|name|slug> --version 2 --output ./skill-v2.zip
```

An existing output file is not overwritten unless `--yes` is passed.

Remote mutation commands reuse the saved login and workspace:

```bash
harhub skills revalidate <id|name|slug> --remote
harhub skills delete <id|name|slug> --remote
harhub assets revalidate <id|name|slug> --remote
harhub assets delete <id|name|slug> --remote
```

## Projects

```bash
harhub projects list
harhub projects show <project-id>
harhub projects create <name> [--description text] [--repository owner/repo] [--branch main]
harhub projects connect <project-id> <owner/repo> [--branch main]
harhub projects inventory <project-id>
harhub projects scan <project-id>
harhub projects diff <project-id> <binding-id> [--path file]
harhub projects publish <project-id> <binding-id>
harhub projects propose <project-id> bootstrap
harhub projects propose <project-id> add-library-skills --asset <asset-id> [--asset <asset-id>...]
harhub projects propose <project-id> remove-skill --binding <binding-id>
harhub projects open <project-id> <proposal-id>
harhub projects rotate-token <project-id> --yes
harhub projects archive <project-id> --yes
```

Destructive project commands require `--yes` (or `-y`).

## GitHub Repositories

Authorize and inspect the workspace GitHub App installation:

```bash
harhub repositories status
harhub repositories authorize [--open]
harhub repositories installations
harhub repositories list <installation-id>
harhub repositories import <installation-id> <repository-id>
harhub repositories connect <project-id> <installation-id> <repository-id>
```

Operate the project repository inventory and pull-request delivery workflow:

```bash
harhub repositories inventory <project-id>
harhub repositories scan <project-id>
harhub repositories policy <project-id> <artifact-path> --ownership repository
harhub repositories policy <project-id> <artifact-path> \
  --ownership library --library-asset <asset-id> [--pinned-version 2]
harhub repositories policy <project-id> <artifact-path> --ownership ignored
harhub repositories propose <project-id> <bootstrap|add-library-skills|remove-skill> [options]
harhub repositories open <project-id> <proposal-id>
```

## Forge

```bash
harhub forge list
harhub forge show <session-id>
harhub forge create "Build an incident-response Skill"
harhub forge create --requirement-file ./requirement.md
harhub forge follow-up <session-id> --answer 'Target runtime=Kubernetes'
harhub forge generate <session-id> --answers-file ./answers.json
harhub forge download <session-id> --output ./generated.zip
harhub forge freeze <session-id> <project-name> [--description text]
harhub forge delete <session-id> --yes
```

`--answers-file` accepts an array of objects containing `question` and `answer`
strings. Follow-up and generation operations stream results. With `--json`, each
stream event is emitted as one JSON object per line (NDJSON), so callers can
consume progress before the terminal `complete` or `error` event.

## Share And Install

```bash
harhub share <id|name|slug>
harhub unshare <id|name|slug>
harhub install https://harhub.rcpd.cc/s/<share-token>
harhub install <share-url|token> --agent codex,claude-code --global --copy --yes
```

The public page works without a Harhub account. Harhub downloads and verifies the
package, then uses its pinned `skills` installer to place it in the selected
Agent directory. A raw share token targets `https://harhub.rcpd.cc` unless
`--url` is explicitly passed.

The public share is also an Agent Skills discovery source:

```bash
npx skills add https://harhub.rcpd.cc/s/<share-token>
npx skills add https://harhub.rcpd.cc/s/<share-token> -a codex -g -y
```

The product decisions and release-pinning requirement for this flow are
documented in the
[Agent Skill Sharing And Installation Loop](../10-sharing-and-installation-loop.md).
