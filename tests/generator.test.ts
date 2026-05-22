import { describe, expect, it } from "vitest";

import {
  buildOperationsFromSwagger,
  normalizeModuleName,
  normalizeToolName,
  splitSwaggerPath,
} from "../src/generator/swagger.js";
import { buildInputSchema } from "../src/tools.js";

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
});
