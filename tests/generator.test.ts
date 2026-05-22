import { describe, expect, it } from "vitest";

import {
  normalizeModuleName,
  normalizeToolName,
  splitSwaggerPath,
} from "../src/generator/swagger.js";

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
});
