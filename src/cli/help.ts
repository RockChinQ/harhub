export function printHelp(): void {
  console.log(`Harhub

Usage:
  harhub assets <command> [options]
  harhub skills <command> [options]

Run "harhub assets help" for asset management commands.
Run "harhub skills help" for skill management commands.`);
}

export function printAssetsHelp(): void {
  console.log(`Harhub Assets MVP

Usage:
  harhub assets scan [paths...] [--catalog .harhub/assets.json] [--json]
  harhub assets validate [paths...] [--json]
  harhub assets list [--catalog .harhub/assets.json] [--kind skill] [--json]
  harhub assets show <id|name|slug> [--catalog .harhub/assets.json] [--json]
  harhub assets upload <skill.zip> --workspace <workspace-id> --token <token> [--api http://127.0.0.1:3310] [--json]
  harhub assets create <name> [--kind skill] [--dir skills] [--description text]
  harhub assets update <id|name|slug> [--catalog .harhub/assets.json] [--description text] [--json]
  harhub assets update <id|name|slug> --workspace <workspace-id> --token <token> [--api http://127.0.0.1:3310] [--description text] [--json]
  harhub assets delete <id|name|slug> [--catalog .harhub/assets.json] [--json]
  harhub assets delete <id|name|slug> --workspace <workspace-id> --token <token> [--api http://127.0.0.1:3310] [--json]
  harhub assets revalidate [id|name|slug] --workspace <workspace-id> --token <token> [--api http://127.0.0.1:3310] [--json]
`);
}

export function printSkillsHelp(): void {
  console.log(`Harhub Skills MVP (compatibility commands)

Usage:
  harhub skills scan [paths...] [--catalog .harhub/skills.json] [--asset-catalog .harhub/assets.json] [--json]
  harhub skills validate [paths...] [--json]
  harhub skills list [--catalog .harhub/skills.json] [--json]
  harhub skills show <id|name|slug> [--catalog .harhub/skills.json] [--json]
  harhub skills create <name> [--dir skills] [--description text]
  harhub skills update <id|name|slug> [--catalog .harhub/skills.json] [--asset-catalog .harhub/assets.json] [--description text] [--json]
  harhub skills update <id|name|slug> --workspace <workspace-id> --token <token> [--api http://127.0.0.1:3310] [--description text] [--json]
  harhub skills delete <id|name|slug> [--catalog .harhub/skills.json] [--asset-catalog .harhub/assets.json] [--json]
  harhub skills delete <id|name|slug> --workspace <workspace-id> --token <token> [--api http://127.0.0.1:3310] [--json]
  harhub skills revalidate [id|name|slug] --workspace <workspace-id> --token <token> [--api http://127.0.0.1:3310] [--json]
`);
}
