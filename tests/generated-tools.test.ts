import { describe, expect, it, vi } from "vitest";

import {
  generatedModules,
  registerGeneratedTools,
} from "../src/generated/tools.js";
import type { ToolRegistry } from "../src/tools.js";

describe("generated MCP tools", () => {
  it("registers accounts_list and calls Mekari client with wrapped result", async () => {
    const registered = new Map<string, { config: any; handler: any }>();
    const registry: ToolRegistry = {
      registerTool: vi.fn((name, config, handler) => {
        registered.set(name, { config, handler });
      }),
    };
    const client = {
      request: vi.fn(async () => ({
        ok: true as const,
        data: { accounts: [] },
      })),
    };

    registerGeneratedTools(registry, client, {
      enableDestructive: false,
      enableMutations: false,
    });

    expect(
      generatedModules
        .find((module) => module.name === "accounts")
        ?.tools.some((tool) => tool.name === "accounts_list"),
    ).toBe(true);
    expect(registered.has("accounts_list")).toBe(true);

    const tool = registered.get("accounts_list");
    expect(tool?.config.inputSchema.parse({ include_archive: false })).toEqual({
      include_archive: false,
    });
    expect(Object.keys(tool?.config.inputSchema.shape ?? {})).not.toContain(
      "client_secret",
    );

    const result = await tool?.handler({ include_archive: false });

    expect(client.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/public/jurnal/api/v1/accounts",
      query: { include_archive: false },
    });
    expect(result).toEqual({
      content: [
        { type: "text", text: JSON.stringify({ ok: true, data: { accounts: [] } }) },
      ],
      structuredContent: { ok: true, data: { accounts: [] } },
    });
  });

  it("keeps request bodies under data for generated mutation tools", async () => {
    const registered = new Map<string, { config: any; handler: any }>();
    const registry: ToolRegistry = {
      registerTool: vi.fn((name, config, handler) => {
        registered.set(name, { config, handler });
      }),
    };
    const client = {
      request: vi.fn(async () => ({ ok: true as const, data: { id: 1 } })),
    };

    registerGeneratedTools(registry, client, {
      enableDestructive: false,
      enableMutations: true,
    });

    const tool = registered.get("accounts_create");
    const data = { account: { name: "Cash" } };

    expect(Object.keys(tool?.config.inputSchema.shape ?? {})).toEqual(["data"]);

    await tool?.handler({ data });

    expect(client.request).toHaveBeenCalledWith({
      data,
      method: "POST",
      path: "/public/jurnal/api/v1/accounts",
    });
  });
});
