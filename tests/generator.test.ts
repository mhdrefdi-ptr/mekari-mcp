import { describe, expect, it } from "vitest";

import {
  buildOperationsFromSwagger,
  emitGeneratedToolDocs,
  normalizeModuleName,
  normalizeToolName,
  splitSwaggerPath,
} from "../src/generator/swagger.js";
import {
  buildInputSchema,
  registerOperations,
  type ToolRegistry,
} from "../src/tools.js";

describe("Swagger naming", () => {
  it("normalizes Swagger tags into MCP Module names", () => {
    expect(normalizeModuleName("ACCOUNTS")).toBe("accounts");
    expect(normalizeModuleName("[SCM] PRODUCT UNIT")).toBe("scm_product_unit");
    expect(normalizeModuleName("PROFIT & LOSS")).toBe("profit_loss");
  });

  it("normalizes Swagger operations into MCP Tool names", () => {
    expect(
      normalizeToolName({
        method: "get",
        moduleName: "accounts",
        operationId: "index",
        path: "/public/jurnal/api/v1/accounts",
      }),
    ).toBe("accounts_list");

    expect(
      normalizeToolName({
        method: "get",
        moduleName: "accounts",
        operationId: "show",
        path: "/public/jurnal/api/v1/accounts/{id}",
      }),
    ).toBe("accounts_get");
  });

  it("splits malformed Swagger query strings out of paths", () => {
    const split = splitSwaggerPath(
      "/public/jurnal/api/v1/stock_adjustment_approval/approval_list?page=1&page_size=25&keyword=",
    );

    expect(split.path).toBe(
      "/public/jurnal/api/v1/stock_adjustment_approval/approval_list",
    );
    expect(split.queryParameters).toEqual([
      { name: "page", defaultValue: "1" },
      { name: "page_size", defaultValue: "25" },
      { name: "keyword", defaultValue: "" },
    ]);
  });

  it("builds best-effort body schemas under data while keeping params top-level", () => {
    const [operation] = buildOperationsFromSwagger({
      paths: {
        "/public/jurnal/api/v1/widgets/{id}?dry_run=false": {
          patch: {
            operationId: "update",
            parameters: [
              { in: "path", name: "id", required: true, type: "integer" },
              {
                in: "body",
                name: "body",
                required: true,
                schema: {
                  type: "object",
                  required: ["widget"],
                  properties: {
                    widget: {
                      type: "object",
                      required: ["name", "price"],
                      properties: {
                        active: { nullable: true, type: "boolean" },
                        name: { type: "string" },
                        price: { format: "double", type: "number" },
                        released_on: { format: "date", type: "string" },
                        tags: { items: { type: "string" }, type: "array" },
                      },
                    },
                  },
                },
              },
            ],
            tags: ["WIDGETS"],
          },
        },
      },
    });

    const schema = buildInputSchema(operation!);
    const parsed = schema.parse({
      data: {
        request_id: "kept",
        widget: {
          active: null,
          name: "Inventory",
          price: 12.5,
          released_on: "not-a-strict-date",
          tags: ["scm"],
          unknown_field: true,
        },
      },
      id: 42,
    });

    expect(Object.keys(schema.shape)).toEqual(["dry_run", "id", "data"]);
    expect(parsed).toEqual({
      data: {
        request_id: "kept",
        widget: {
          active: null,
          name: "Inventory",
          price: 12.5,
          released_on: "not-a-strict-date",
          tags: ["scm"],
          unknown_field: true,
        },
      },
      dry_run: "false",
      id: 42,
    });
    expect(() =>
      schema.parse({ data: { widget: { price: 12.5 } }, id: 42 }),
    ).toThrow();
    expect(() =>
      schema.parse({
        data: { widget: { name: "Inventory", price: "12.5" } },
        id: 42,
      }),
    ).toThrow();
  });

  it("classifies read, mutation, and custom destructive operations", () => {
    const operations = buildOperationsFromSwagger({
      paths: {
        "/public/jurnal/api/v1/widgets": {
          get: {
            operationId: "index",
            tags: ["WIDGETS"],
          },
          post: {
            operationId: "create",
            tags: ["WIDGETS"],
          },
        },
        "/public/jurnal/api/v1/widgets/{id}/deactivate": {
          post: {
            operationId: "deactivate",
            tags: ["WIDGETS"],
          },
        },
        "/public/jurnal/api/v1/widgets/{id}/remove_logo": {
          post: {
            operationId: "remove_logo",
            tags: ["WIDGETS"],
          },
        },
      },
    });

    expect(
      operations.map((operation) => ({
        name: operation.name,
        safetyLevel: operation.safetyLevel,
      })),
    ).toEqual([
      { name: "widgets_list", safetyLevel: "read" },
      { name: "widgets_create", safetyLevel: "mutation" },
      { name: "widgets_deactivate", safetyLevel: "destructive" },
      { name: "widgets_remove_logo", safetyLevel: "destructive" },
    ]);
  });
});

describe("Generated tool docs", () => {
  it("documents modules, tools, inputs, gates, and Swagger examples without bloating runtime descriptions", () => {
    const operations = buildOperationsFromSwagger({
      paths: {
        "/public/jurnal/api/v1/widgets/{id}?dry_run=false": {
          patch: {
            description: "Updates a widget in the current company.",
            operationId: "update",
            parameters: [
              { in: "path", name: "id", required: true, type: "integer" },
              { in: "query", name: "notify", required: false, type: "boolean" },
              {
                in: "body",
                name: "body",
                required: true,
                schema: {
                  example: {
                    widget: {
                      name: "Docs-only example",
                    },
                  },
                  properties: {
                    widget: {
                      properties: {
                        name: { type: "string" },
                      },
                      required: ["name"],
                      type: "object",
                    },
                  },
                  required: ["widget"],
                  type: "object",
                },
              },
            ],
            responses: {
              "200": {
                examples: {
                  "application/json": {
                    widget: { id: 7, name: "Docs-only example" },
                  },
                },
              },
            },
            summary: "Update Widget",
            tags: ["WIDGETS"],
          },
        },
        "/public/jurnal/api/v1/widgets/{id}/remove_logo": {
          post: {
            operationId: "remove_logo",
            summary: "Remove Widget Logo",
            tags: ["WIDGETS"],
          },
        },
      },
    } as any);

    const docs = emitGeneratedToolDocs(operations);

    expect(docs).toContain("# Mekari Jurnal MCP Modules and Tools");
    expect(docs).toContain("## Runtime gates");
    expect(docs).toContain("MEKARI_ENABLE_MUTATIONS=true");
    expect(docs).toContain("MEKARI_ENABLE_DESTRUCTIVE=true");
    expect(docs).toContain("MEKARI_MODULES=accounts,customers");
    expect(docs).toContain("## Module `widgets`");
    expect(docs).toContain("Source Swagger tag: `WIDGETS`");
    expect(docs).toContain("### `widgets_update`");
    expect(docs).toContain("- Method: `PATCH`");
    expect(docs).toContain("- Path: `/public/jurnal/api/v1/widgets/{id}`");
    expect(docs).toContain("- Summary: Update Widget");
    expect(docs).toContain("- Safety: `mutation`");
    expect(docs).toContain("- Path `id`: integer, required");
    expect(docs).toContain("- Query `dry_run`: string, optional, default `false`");
    expect(docs).toContain("- Query `notify`: boolean, optional");
    expect(docs).toContain("- Body `data`: object, required");
    expect(docs).toContain("Required fields: `widget`, `widget.name`");
    expect(docs).toContain("#### Swagger Examples");
    expect(docs).toContain("Request body example");
    expect(docs).toContain("Response `200` `application/json`");
    expect(docs).toContain('"Docs-only example"');
    expect(docs).toContain("### `widgets_remove_logo`");
    expect(docs).toContain("- Safety: `destructive`");

    const registered = new Map<string, { config: { description?: string } }>();
    const registry: ToolRegistry = {
      registerTool: (name, config) => {
        registered.set(name, { config });
      },
    };

    registerOperations(
      registry,
      operations,
      {
        request: async () => ({ ok: true, data: {} }),
      },
      { enableMutations: true },
    );

    const description = registered.get("widgets_update")?.config.description ?? "";
    expect(description).toContain("Update Widget");
    expect(description).toContain("PATCH /public/jurnal/api/v1/widgets/{id}");
    expect(description).not.toContain("Docs-only example");
    expect(description.length).toBeLessThan(180);
  });
});
