import { parseArgs } from "./args.js";
import {
  runAssetsCreate,
  runAssetsList,
  runAssetsScan,
  runAssetsShow,
  runAssetsUpload,
  runAssetsValidate
} from "./commands/assets.js";
import {
  runCreate,
  runList,
  runScan,
  runShow,
  runValidate
} from "./commands/skills.js";
import {
  printAssetsHelp,
  printHelp,
  printSkillsHelp
} from "./help.js";

export async function runCli(argv: string[]): Promise<number> {
  const [command, subcommand, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

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
    default:
      console.error(`Unknown skills command: ${subcommand}`);
      printSkillsHelp();
      return 1;
  }
}
