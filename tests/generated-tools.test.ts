import { describe, expect, it, vi } from "vitest";

import {
  generatedModules,
  registerGeneratedTools,
} from "../src/generated/tools.js";
import type { ToolRegistry } from "../src/tools.js";

describe("generated MCP tools", () => {
  function createRegistry() {
    const registered = new Map<string, { config: any; handler: any }>();
    const registry: ToolRegistry = {
      registerTool: vi.fn((name, config, handler) => {
        registered.set(name, { config, handler });
      }),
    };
    const client = {
      request: vi.fn(async () => ({ ok: true as const, data: {} })),
    };

    return { client, registered, registry };
  }

  it("registers accounts_list and calls Mekari client with wrapped result", async () => {
    const { registered, registry } = createRegistry();
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

  it("hides mutation and destructive tools by default", () => {
    const { client, registered, registry } = createRegistry();

    registerGeneratedTools(registry, client);

    expect(registered.has("accounts_list")).toBe(true);
    expect(registered.has("accounts_create")).toBe(false);
    expect(registered.has("accounts_delete")).toBe(false);
  });

  it("keeps request bodies under data for generated mutation tools", async () => {
    const { registered, registry } = createRegistry();
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

  it("validates generated nested body schemas without stripping unknown fields", async () => {
    const { registered, registry } = createRegistry();
    const client = {
      request: vi.fn(async () => ({ ok: true as const, data: { id: 1 } })),
    };

    registerGeneratedTools(registry, client, {
      enableMutations: true,
    });

    const tool = registered.get("contacts_post_api_v1_contact_groups");
    const data = {
      contact_group: {
        company_id: null,
        contact_group_role: 1,
        name: "VIP",
        unknown_field: true,
      },
      request_id: "kept",
    };

    expect(tool).toBeDefined();
    expect(tool?.config.inputSchema.parse({ data })).toEqual({ data });
    expect(() =>
      tool?.config.inputSchema.parse({
        data: { contact_group: { name: "VIP" } },
      }),
    ).toThrow();

    await tool?.handler({ data });

    expect(client.request).toHaveBeenCalledWith({
      data,
      method: "POST",
      path: "/public/jurnal/api/v1/contact_groups",
    });
  });

  it("hides custom destructive actions unless destructive tools are enabled", () => {
    const { client, registered, registry } = createRegistry();

    registerGeneratedTools(registry, client, {
      enableDestructive: false,
      enableMutations: true,
    });

    expect(registered.has("accounts_update")).toBe(true);
    expect(
      registered.has("contacts_post_api_v1_contacts_contact_id_deactivate"),
    ).toBe(false);
  });

  it("registers destructive tools under both safety gates", async () => {
    const { client, registered, registry } = createRegistry();

    registerGeneratedTools(registry, client, {
      enableDestructive: true,
      enableMutations: true,
    });

    const deactivate = registered.get(
      "contacts_post_api_v1_contacts_contact_id_deactivate",
    );
    expect(registered.has("accounts_delete")).toBe(true);
    expect(deactivate).toBeDefined();

    await deactivate?.handler({ contact_id: "c-1" });

    expect(client.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/public/jurnal/api/v1/contacts/c-1/deactivate",
    });
  });

  it("filters registered tools by normalized module name", () => {
    const { client, registered, registry } = createRegistry();

    registerGeneratedTools(registry, client, { modules: ["accounts"] });

    expect(registered.has("accounts_list")).toBe(true);
    expect(registered.has("customers_list")).toBe(false);
    expect(
      Array.from(registered.keys()).every((name) => name.startsWith("accounts_")),
    ).toBe(true);
  });
});
