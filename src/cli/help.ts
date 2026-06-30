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
  harhub assets list [--catalog .harhub/assets.json] [--kind skill] [--tag value] [--owner value] [--package value] [--json]
  harhub assets show <id|name|slug> [--catalog .harhub/assets.json] [--json]
  harhub assets upload <skill.zip> --workspace <workspace-id> --token <token> [--api http://127.0.0.1:3310] [--name slug] [--description text] [--owner owner] [--tag value] [--json]
  harhub assets create <name> [--kind skill] [--dir skills] [--description text] [--owner owner] [--tag value]
`);
}

export function printSkillsHelp(): void {
  console.log(`Harhub Skills MVP (compatibility commands)

Usage:
  harhub skills scan [paths...] [--catalog .harhub/skills.json] [--asset-catalog .harhub/assets.json] [--json]
  harhub skills validate [paths...] [--json]
  harhub skills list [--catalog .harhub/skills.json] [--tag value] [--owner value] [--package value] [--json]
  harhub skills show <id|name|slug> [--catalog .harhub/skills.json] [--json]
  harhub skills create <name> [--dir skills] [--description text] [--owner owner] [--tag value]
`);
}
