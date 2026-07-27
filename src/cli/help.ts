import { DEFAULT_HARHUB_API_URL } from "./api.js";

export function printHelp(): void {
  console.log(`Harhub

Usage:
  harhub login [--url ${DEFAULT_HARHUB_API_URL}] [--workspace <id|slug|name>] [--no-browser] [--json]
  harhub logout [--json]
  harhub whoami [--json]
  harhub install <share-url|token> [--agent <name[,name]>] [--global] [--copy] [--yes] [--all] [--url ${DEFAULT_HARHUB_API_URL}] [--json]
  harhub download <asset-id|name|slug> [--version <n>] [--output <path>] [--yes] [remote options]
  harhub share <asset-id|name|slug> [remote options]
  harhub unshare <asset-id|name|slug> [remote options]
  harhub assets <command> [options]
  harhub skills <command> [options]
  harhub projects <command> [options]
  harhub repositories <command> [options]
  harhub forge <command> [options]

Remote options:
  --workspace, -w <id>   Workspace id, slug, or configured workspace
  --token, -t <token>    Access token (normally loaded from login config)
  --url, -u <url>        Harhub server (default ${DEFAULT_HARHUB_API_URL})
  --json, -j             Machine-readable JSON/NDJSON output

Conventional short aliases:
  -h --help    -y --yes    -g --global    -r --remote    -a --all
  -o --output  -d --description  -b --branch  -f --file  -c --content  -v --version

Run "harhub <group> help" for command-group details.`);
}

export function printLoginHelp(): void {
  console.log(`Harhub Login

Usage:
  harhub login [--url ${DEFAULT_HARHUB_API_URL}] [--workspace <id|slug|name>] [--no-browser] [--json]

Uses OAuth 2.0 device authorization. The CLI opens a browser for approval,
then securely saves the access token and default workspace for later commands.`);
}

export function printDownloadHelp(): void {
  console.log(`Harhub Download

Usage:
  harhub download <id|name|slug> [--version <n>] [--output <path>] [--yes]

Options:
  -v, --version <n>   Download a retained historical version; defaults to current
  -o, --output <path> Write to this file or directory
  -y, --yes           Overwrite an existing output file
  -j, --json          Print machine-readable result metadata`);
}

export function printAssetsHelp(): void {
  console.log(`Harhub Assets

Local catalog:
  harhub assets scan [paths...] [--catalog .harhub/assets.json] [--json]
  harhub assets validate [paths...] [--json]
  harhub assets list [--catalog .harhub/assets.json] [--kind skill] [--json]
  harhub assets show <id|name|slug> [--catalog .harhub/assets.json] [--json]
  harhub assets create <name> [--kind skill] [--dir skills] [--description text]
  harhub assets update <id|name|slug> [--description text] [--json]
  harhub assets delete <id|name|slug> [--json]

Workspace assets:
  harhub assets list --remote [remote options]
  harhub assets show <id|name|slug> --remote [remote options]
  harhub assets upload <archive.zip> [--share] [remote options]
  harhub assets delete <id|name|slug> --remote [remote options]
  harhub assets revalidate [id|name|slug] --remote [remote options]

Use top-level "harhub download" to download an asset version.`);
}

export function printSkillsHelp(): void {
  console.log(`Harhub Skills

Local catalog:
  harhub skills scan [paths...] [--catalog .harhub/skills.json] [--asset-catalog .harhub/assets.json] [--json]
  harhub skills validate [paths...] [--json]
  harhub skills list [--catalog .harhub/skills.json] [--json]
  harhub skills show <id|name|slug> [--catalog .harhub/skills.json] [--json]
  harhub skills create <name> [--dir skills] [--description text]
  harhub skills update <id|name|slug> [--description text] [--json]
  harhub skills delete <id|name|slug> [--json]

Workspace Skills:
  harhub skills list --remote [remote options]
  harhub skills show <id|name|slug> --remote [remote options]
  harhub skills upload [paths...] [--share] [--all] [remote options]
  harhub skills edit <id|name|slug> [--file SKILL.md] [--content text|--content-file path] [--editor command] [remote options]
  harhub skills delete <id|name|slug> --remote [remote options]
  harhub skills revalidate [id|name|slug] --remote [remote options]

Remote edit downloads the current package, edits and validates it, then uploads a new immutable version.`);
}

export function printProjectsHelp(): void {
  console.log(`Harhub Projects

Usage:
  harhub projects list [remote options]
  harhub projects show <project-id> [remote options]
  harhub projects create <name> [--description text] [--repository owner/repo] [--branch main] [remote options]
  harhub projects connect <project-id> <owner/repo> [--branch main] [remote options]
  harhub projects inventory <project-id> [remote options]
  harhub projects scan <project-id> [remote options]
  harhub projects diff <project-id> <binding-id> [--path file] [remote options]
  harhub projects publish <project-id> <binding-id> [remote options]
  harhub projects propose <project-id> bootstrap [remote options]
  harhub projects propose <project-id> add-library-skills --asset <asset-id>... [remote options]
  harhub projects propose <project-id> remove-skill --binding <binding-id> [remote options]
  harhub projects open <project-id> <proposal-id> [remote options]
  harhub projects rotate-token <project-id> --yes [remote options]
  harhub projects archive <project-id> --yes [remote options]`);
}

export function printRepositoriesHelp(): void {
  console.log(`Harhub Repositories

GitHub App:
  harhub repositories status [remote options]
  harhub repositories authorize [--redirect /projects] [--open] [remote options]
  harhub repositories installations [remote options]
  harhub repositories list <installation-id> [remote options]
  harhub repositories import <installation-id> <repository-id> [remote options]
  harhub repositories connect <project-id> <installation-id> <repository-id> [remote options]

Repository inventory and delivery:
  harhub repositories inventory <project-id> [remote options]
  harhub repositories scan <project-id> [remote options]
  harhub repositories policy <project-id> <artifact-path> --ownership <library|repository|ignored> [--library-asset id] [--pinned-version n] [remote options]
  harhub repositories propose <project-id> <bootstrap|add-library-skills|remove-skill> [proposal options] [remote options]
  harhub repositories open <project-id> <proposal-id> [remote options]`);
}

export function printForgeHelp(): void {
  console.log(`Harhub Forge

Usage:
  harhub forge list [remote options]
  harhub forge show <session-id> [remote options]
  harhub forge create <requirement> [--requirement-file path] [remote options]
  harhub forge follow-up <session-id> [--answer question=answer] [--answers-file answers.json] [remote options]
  harhub forge generate <session-id> [--answer question=answer] [--answers-file answers.json] [remote options]
  harhub forge download <session-id> [--output path] [--yes] [remote options]
  harhub forge freeze <session-id> <project-name> [--description text] [remote options]
  harhub forge delete <session-id> --yes [remote options]

With --json, Forge operations emit one JSON object per line (NDJSON) while streaming.`);
}
