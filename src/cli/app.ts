import { parseArgs } from "./args.js";
import {
  runAssetsCreate,
  runAssetsDelete,
  runAssetsList,
  runAssetsRevalidate,
  runAssetsScan,
  runAssetsShow,
  runAssetsUpdate,
  runAssetsUpload,
  runAssetsValidate
} from "./commands/assets.js";
import {
  runCreate,
  runDelete,
  runList,
  runRevalidate,
  runScan,
  runShow,
  runUpdate,
  runUpload,
  runValidate
} from "./commands/skills.js";
import { runLogin, runLogout, runWhoami } from "./commands/auth.js";
import { runInstall, runShare, runUnshare } from "./commands/share.js";
import {
  printAssetsHelp,
  printHelp,
  printLoginHelp,
  printSkillsHelp
} from "./help.js";

export async function runCli(argv: string[]): Promise<number> {
  const [command, subcommand, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command === "login" && ["help", "--help", "-h"].includes(subcommand ?? "")) {
    printLoginHelp();
    return 0;
  }
  if (command === "login") return runLogin(parseArgs(argv.slice(1)));
  if (command === "logout") return runLogout(parseArgs(argv.slice(1)));
  if (command === "whoami") return runWhoami(parseArgs(argv.slice(1)));
  if (command === "install") return runInstall(parseArgs(argv.slice(1)));
  if (command === "share") return runShare(parseArgs(argv.slice(1)));
  if (command === "unshare") return runUnshare(parseArgs(argv.slice(1)));

  if (command !== "skills" && command !== "assets") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  }

  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    if (command === "assets") printAssetsHelp();
    else printSkillsHelp();
    return 0;
  }

  const parsed = parseArgs(rest);
  return command === "assets"
    ? runAssetCommand(subcommand, parsed)
    : runSkillCommand(subcommand, parsed);
}

async function runAssetCommand(subcommand: string, parsed: ReturnType<typeof parseArgs>) {
  switch (subcommand) {
    case "scan":
      return runAssetsScan(parsed);
    case "validate":
      return runAssetsValidate(parsed);
    case "list":
      return runAssetsList(parsed);
    case "show":
      return runAssetsShow(parsed);
    case "create":
      return runAssetsCreate(parsed);
    case "upload":
      return runAssetsUpload(parsed);
    case "update":
      return runAssetsUpdate(parsed);
    case "delete":
      return runAssetsDelete(parsed);
    case "revalidate":
      return runAssetsRevalidate(parsed);
    default:
      console.error(`Unknown assets command: ${subcommand}`);
      printAssetsHelp();
      return 1;
  }
}

function runSkillCommand(subcommand: string, parsed: ReturnType<typeof parseArgs>) {
  switch (subcommand) {
    case "scan":
      return runScan(parsed);
    case "validate":
      return runValidate(parsed);
    case "list":
      return runList(parsed);
    case "show":
      return runShow(parsed);
    case "create":
      return runCreate(parsed);
    case "upload":
      return runUpload(parsed);
    case "update":
      return runUpdate(parsed);
    case "delete":
      return runDelete(parsed);
    case "revalidate":
      return runRevalidate(parsed);
    default:
      console.error(`Unknown skills command: ${subcommand}`);
      printSkillsHelp();
      return 1;
  }
}
