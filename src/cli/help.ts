import { DEFAULT_HARHUB_API_URL } from "./api.js";

export function printHelp(): void {
  console.log(`Harhub

Usage:
  harhub login [--url ${DEFAULT_HARHUB_API_URL}] [--workspace <id|slug|name>] [--no-browser] [--json]
  harhub logout [--json]
  harhub whoami [--json]
  harhub install <share-url|token> [--url ${DEFAULT_HARHUB_API_URL}] [--json]
  harhub share <asset-id|name|slug> [--workspace <workspace-id>] [--url ${DEFAULT_HARHUB_API_URL}] [--json]
  harhub unshare <asset-id|name|slug> [--workspace <workspace-id>] [--url ${DEFAULT_HARHUB_API_URL}] [--json]
  harhub assets <command> [options]
  harhub skills <command> [options]

Run "harhub assets help" for asset management commands.
Run "harhub skills help" for skill management commands.`);
}

export function printLoginHelp(): void {
  console.log(`Harhub Login

Usage:
  harhub login [--url ${DEFAULT_HARHUB_API_URL}] [--workspace <id|slug|name>] [--no-browser] [--json]

Uses OAuth 2.0 device authorization. The CLI opens a browser for approval,
then securely saves the access token and default workspace for later commands.`);
}

export function printAssetsHelp(): void {
  console.log(`Harhub Assets MVP

Usage:
  harhub assets scan [paths...] [--catalog .harhub/assets.json] [--json]
  harhub assets validate [paths...] [--json]
  harhub assets list [--catalog .harhub/assets.json] [--kind skill] [--json]
  harhub assets show <id|name|slug> [--catalog .harhub/assets.json] [--json]
  harhub assets upload <skill.zip> [--share] [--workspace <workspace-id>] [--token <token>] [--url ${DEFAULT_HARHUB_API_URL}] [--json]
  harhub assets create <name> [--kind skill] [--dir skills] [--description text]
  harhub assets update <id|name|slug> [--catalog .harhub/assets.json] [--description text] [--json]
  harhub assets delete <id|name|slug> [--catalog .harhub/assets.json] [--json]
  harhub assets delete <id|name|slug> --remote [--workspace <workspace-id>] [--token <token>] [--url ${DEFAULT_HARHUB_API_URL}] [--json]
  harhub assets revalidate [id|name|slug] --remote [--workspace <workspace-id>] [--token <token>] [--url ${DEFAULT_HARHUB_API_URL}] [--json]
`);
}

export function printSkillsHelp(): void {
  console.log(`Harhub Skills MVP

Usage:
  harhub skills scan [paths...] [--catalog .harhub/skills.json] [--asset-catalog .harhub/assets.json] [--json]
  harhub skills validate [paths...] [--json]
  harhub skills list [--catalog .harhub/skills.json] [--json]
  harhub skills show <id|name|slug> [--catalog .harhub/skills.json] [--json]
  harhub skills create <name> [--dir skills] [--description text]
  harhub skills upload [paths...] [--share] [--workspace <workspace-id>] [--token <token>] [--url ${DEFAULT_HARHUB_API_URL}] [--all] [--json]
  harhub skills update <id|name|slug> [--catalog .harhub/skills.json] [--asset-catalog .harhub/assets.json] [--description text] [--json]
  harhub skills delete <id|name|slug> [--catalog .harhub/skills.json] [--asset-catalog .harhub/assets.json] [--json]
  harhub skills delete <id|name|slug> --remote [--workspace <workspace-id>] [--token <token>] [--url ${DEFAULT_HARHUB_API_URL}] [--json]
  harhub skills revalidate [id|name|slug] --remote [--workspace <workspace-id>] [--token <token>] [--url ${DEFAULT_HARHUB_API_URL}] [--json]
`);
}
