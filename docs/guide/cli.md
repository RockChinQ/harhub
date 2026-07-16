# CLI

The Harhub CLI helps teams discover local Skills and upload them to a workspace.

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
workspace are then reused by upload and remote mutation commands.

For a local or self-managed server:

```bash
harhub login --url http://127.0.0.1:3310
```

Commands without `--url` always target `https://harhub.rcpd.cc`. When using a
self-managed server, pass the same `--url` on later commands; the CLI still
reuses that server's saved token and workspace, so they do not need to be
entered again.

Use `--no-browser` when the CLI cannot launch a browser automatically. Check or
remove the saved login with:

```bash
harhub whoami
harhub logout
```

On Linux and macOS, the config is stored under
`$XDG_CONFIG_HOME/harhub/config.json` or `~/.config/harhub/config.json` with
user-only permissions. Set `HARHUB_CONFIG` to override that path. Command-line
token and workspace flags take precedence over `HARHUB_WORKSPACE_ID` and
`HARHUB_TOKEN`, which in turn take precedence over the saved login. Server
selection is only changed with an explicit `--url`.

The CLI automatically honors uppercase and lowercase `HTTP_PROXY`,
`HTTPS_PROXY`, and `NO_PROXY` environment variables. A transient network failure
while polling an approved device is retried until the device authorization
expires.

## Upload Skills

Open the interactive selector:

```bash
harhub skills upload
```

Scan a specific repository:

```bash
harhub skills upload /path/to/repo
```

Upload all valid discovered Skills without the selector:

```bash
harhub skills upload /path/to/repo --all
```

Add `--share` to create a public link for every successful upload and print the
link immediately:

```bash
harhub skills upload /path/to/repo --all --share
```

## Share, Install, And Download

Share or revoke an existing uploaded Skill using its id, name, or slug. These
commands reuse the saved login and workspace:

```bash
harhub share <id|name|slug>
harhub unshare <id|name|slug>
```

The public page can be opened without a Harhub account. It exposes the Skill's
public metadata, a revocable zip download, and copyable commands for Harhub and
the open Agent Skills CLI. Harhub downloads and verifies the package, then uses
its pinned `skills` installer to place it in the selected Agent directory:

```bash
harhub install https://harhub.rcpd.cc/s/<share-token>
```

Select one or more comma-separated Agents, global scope, copy mode, and
non-interactive confirmation when needed:

```bash
harhub install <share-url|token> --agent codex,claude-code --global --copy --yes
```

The public share is also an Agent Skills discovery source:

```bash
npx skills add https://harhub.rcpd.cc/s/<share-token>
npx skills add https://harhub.rcpd.cc/s/<share-token> -a codex -g -y
```

A raw share token targets `https://harhub.rcpd.cc` unless `--url` is explicitly
passed.

The product decisions, release-pinning requirement, and acceptance criteria for
this flow are documented in the
[Agent Skill Sharing And Installation Loop](../10-sharing-and-installation-loop.md).

## Useful Commands

```bash
harhub skills scan [paths...]
harhub skills validate [paths...]
harhub skills create <name> [--dir skills]
harhub skills upload [paths...] [--share]
harhub install <share-url|token> [--agent <name[,name]>] [--global] [--copy] [--yes]
harhub share <id|name|slug>
harhub unshare <id|name|slug>
harhub assets list
harhub assets show <id|name|slug>
```

The scan, validate, list, show, create, and local update commands operate on
local paths or `.harhub` indexes. The server does not scan paths on its own;
`skills upload` scans and packages local Skill directories before sending zip
files to the workspace API.

Uploaded workspace packages are immutable. Change the local Skill and upload
it again rather than using a remote update command. Use `--remote` for hosted
delete and revalidation commands; they reuse the saved token and workspace.
