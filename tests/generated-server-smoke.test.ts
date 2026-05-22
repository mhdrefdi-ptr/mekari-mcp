import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import type {
  MekariClient,
  MekariRequest,
  MekariToolResult,
} from "../src/client.js";
import {
  buildGeneratedModules,
  buildOperationsFromSwagger,
  emitGeneratedToolDocs,
  emitGeneratedTools,
} from "../src/generator/swagger.js";
import {
  generatedModules,
  generatedOperations,
  registerGeneratedTools,
} from "../src/generated/tools.js";
import { createMekariMcpServer } from "../src/server.js";
import type { GeneratedOperation, ToolRegistry } from "../src/tools.js";

type RegisteredTool = {
  config: Parameters<ToolRegistry["registerTool"]>[1];
  handler: Parameters<ToolRegistry["registerTool"]>[2];
};

describe("generated Mekari MCP server smoke", () => {
  it("represents every Swagger operation and module in generated metadata", async () => {
    const swaggerOperations = await loadSwaggerOperations();
    const expectedOperations = stripDocsExamples(swaggerOperations);

    expect(generatedOperations).toHaveLength(415);
    expect(generatedModules).toHaveLength(93);
    expect(generatedOperations).toEqual(expectedOperations);
    expect(generatedModules).toEqual(buildGeneratedModules(swaggerOperations));
  });

  it("registers and renders representative tools only under their safety gates", async () => {
    const defaultTools = createRegistry();
    registerGeneratedTools(defaultTools.registry, defaultTools.client);

    expect(defaultTools.registered.has("accounts_list")).toBe(true);
    expect(defaultTools.registered.has("sales_invoices_list")).toBe(true);
    expect(defaultTools.registered.has("sales_invoices_get")).toBe(true);
    expect(defaultTools.registered.has("accounts_create")).toBe(false);
    expect(defaultTools.registered.has("accounts_delete")).toBe(false);
    expect(
      defaultTools.registered.has(
        "contacts_post_api_v1_contacts_contact_id_deactivate",
      ),
    ).toBe(false);

    await callTool(defaultTools, "accounts_list", { include_archive: false });
    expect(defaultTools.client.request).toHaveBeenLastCalledWith({
      method: "GET",
      path: "/public/jurnal/api/v1/accounts",
      query: { include_archive: false },
    });

    await callTool(defaultTools, "sales_invoices_get", {
      id: "si/1",
      include_custom_fields: "true",
    });
    expect(defaultTools.client.request).toHaveBeenLastCalledWith({
      method: "GET",
      path: "/public/jurnal/api/v1/sales_invoices/si%2F1",
      query: { include_custom_fields: "true" },
    });

    const mutationTools = createRegistry();
    registerGeneratedTools(mutationTools.registry, mutationTools.client, {
      enableMutations: true,
    });

    expect(mutationTools.registered.has("accounts_create")).toBe(true);
    expect(mutationTools.registered.has("accounts_delete")).toBe(false);
    expect(
      mutationTools.registered.has(
        "contacts_post_api_v1_contacts_contact_id_deactivate",
      ),
    ).toBe(false);

    const accountData = { account: { name: "Cash" } };
    await callTool(mutationTools, "accounts_create", { data: accountData });
    expect(mutationTools.client.request).toHaveBeenLastCalledWith({
      data: accountData,
      method: "POST",
      path: "/public/jurnal/api/v1/accounts",
    });

    const destructiveTools = createRegistry();
    registerGeneratedTools(destructiveTools.registry, destructiveTools.client, {
      enableDestructive: true,
      enableMutations: true,
    });

    await callTool(destructiveTools, "accounts_delete", { id: "acct/1" });
    expect(destructiveTools.client.request).toHaveBeenLastCalledWith({
      method: "DELETE",
      path: "/public/jurnal/api/v1/accounts/acct%2F1",
    });

    await callTool(
      destructiveTools,
      "contacts_post_api_v1_contacts_contact_id_deactivate",
      { contact_id: "contact 1" },
    );
    expect(destructiveTools.client.request).toHaveBeenLastCalledWith({
      method: "POST",
      path: "/public/jurnal/api/v1/contacts/contact%201/deactivate",
    });
  });

  it("keeps paged API results to one Mekari API call per MCP tool call", async () => {
    const tools = createRegistry({
      ok: true,
      data: {
        sales_invoices: [{ id: 1 }],
        page: 2,
        page_size: 25,
      },
    });
    registerGeneratedTools(tools.registry, tools.client);

    const result = await callTool(tools, "sales_invoices_list", {
      page: "2",
      page_size: "25",
    });

    expect(tools.client.request).toHaveBeenCalledTimes(1);
    expect(tools.client.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/public/jurnal/api/v1/sales_invoices",
      query: { page: "2", page_size: "25" },
    });
    expect(result.structuredContent).toEqual({
      ok: true,
      data: {
        sales_invoices: [{ id: 1 }],
        page: 2,
        page_size: 25,
      },
    });
  });

  it("does not call Mekari during default server construction", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("live fetch blocked"));

    createMekariMcpServer({
      baseUrl: "https://api.mekari.com",
      clientId: "client-id",
      clientSecret: "client-secret",
      enableDestructive: false,
      enableMutations: false,
      logger: () => undefined,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("starts stdio without non-protocol stdout logs", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MEKARI_CLIENT_ID: "client-id",
        MEKARI_CLIENT_SECRET: "secret",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    await new Promise((resolve) => setTimeout(resolve, 250));

    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
    }

    expect(stdout).toBe("");
    expect(stderr).not.toContain("MEKARI_CLIENT_SECRET");
    expect(stderr).not.toContain("secret");
  });

  it("keeps generated outputs reproducible and free of manual runtime behavior", async () => {
    const swaggerOperations = await loadSwaggerOperations();
    const generatedSource = await readFile("src/generated/tools.ts", "utf8");
    const docsSource = await readFile("docs/generated/mekari-tools.md", "utf8");

    expect(generatedSource).toBe(emitGeneratedTools(swaggerOperations));
    expect(docsSource).toBe(emitGeneratedToolDocs(swaggerOperations));
    expect(generatedSource).toContain("Do not edit manually");
    expect(generatedSource).not.toContain("docsExamples");
    expect(generatedSource).not.toContain("process.env");
    expect(generatedSource).not.toContain("createMekariClient");
    expect(generatedSource).not.toContain("fetch(");
  });
});

async function loadSwaggerOperations(): Promise<GeneratedOperation[]> {
  const swagger = JSON.parse(await readFile("docs/mekari.swagger.json", "utf8"));
  return buildOperationsFromSwagger(swagger);
}

function stripDocsExamples(
  operations: readonly GeneratedOperation[],
): GeneratedOperation[] {
  return operations.map(({ docsExamples: _docsExamples, ...operation }) => ({
    ...operation,
  }));
}

function createRegistry(
  response: MekariToolResult = { ok: true, data: { smoke: true } },
): {
  client: MekariClient & { request: ReturnType<typeof vi.fn> };
  registered: Map<string, RegisteredTool>;
  registry: ToolRegistry;
} {
  const registered = new Map<string, RegisteredTool>();
  const client = {
    request: vi.fn(async (_request: MekariRequest) => response),
  };
  const registry: ToolRegistry = {
    registerTool: vi.fn((name, config, handler) => {
      registered.set(name, { config, handler });
    }),
  };

  return { client, registered, registry };
}

async function callTool(
  tools: { registered: Map<string, RegisteredTool> },
  name: string,
  args: Record<string, unknown>,
) {
  const tool = tools.registered.get(name);
  expect(tool).toBeDefined();
  return tool!.handler(args);
}
