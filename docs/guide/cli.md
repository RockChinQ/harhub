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

## Useful Commands

```bash
harhub skills scan [paths...]
harhub skills validate [paths...]
harhub skills create <name> [--dir skills]
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
