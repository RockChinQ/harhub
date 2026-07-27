#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { closeHarhubHttp } from "./cli/http.js";
import { createHarhubMcpServer } from "./mcp/server.js";

async function main(): Promise<void> {
  const server = createHarhubMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await closeHarhubHttp();
  process.exitCode = 1;
});
