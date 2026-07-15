#!/usr/bin/env node
import { runCli } from "./cli/app.js";
import { closeHarhubHttp } from "./cli/http.js";

async function main(): Promise<void> {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await closeHarhubHttp().catch(() => undefined);
  }
}

void main();
