# CLI

The Harhub CLI helps teams discover local Skills and upload them to a workspace.

## Install From Source

```bash
npm install
npm run build
npm install -g .
```

## Configure

The CLI defaults to the hosted demo:

```text
https://harhub.rcpd.cc
```

For a local API, set:

```bash
export HARHUB_URL=http://127.0.0.1:3310
export HARHUB_WORKSPACE_ID=ws_demo
export HARHUB_TOKEN=<access-token>
```

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
harhub assets list
harhub assets show <id|name|slug>
```
