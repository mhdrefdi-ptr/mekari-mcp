import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMekariClient } from "./client.js";
import { loadMekariConfig, type MekariConfig } from "./config.js";
import { registerGeneratedTools } from "./generated/tools.js";
import type { ToolRegistry } from "./tools.js";

export function createMekariMcpServer(
  config: MekariConfig = loadMekariConfig(),
): McpServer {
  const server = new McpServer({
    name: "mekari-jurnal-mcp",
    version: "0.1.0",
  });
  const client = createMekariClient(config);

  registerGeneratedTools(server as unknown as ToolRegistry, client, config);

  return server;
}

export async function runStdioServer(): Promise<void> {
  const server = createMekariMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
