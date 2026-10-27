import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildQueryString, createMekariHeaders } from "../src/auth.js";

describe("Mekari HMAC auth", () => {
  it("builds required HMAC header shape", () => {
    const date = new Date("2020-10-28T06:23:23Z");
    const headers = createMekariHeaders(
      { clientId: "client-id", clientSecret: "secret" },
      {
        date,
        method: "GET",
        path: "/public/jurnal/api/v1/accounts",
        query: { include_archive: false },
      },
    );

    const httpDate = "Wed, 28 Oct 2020 06:23:23 GMT";
    const requestLine =
      "GET /public/jurnal/api/v1/accounts?include_archive=false HTTP/1.1";
    const signature = createHmac("sha256", "secret")
      .update(`date: ${httpDate}\n${requestLine}`)
      .digest("base64");

    expect(headers.Date).toBe(httpDate);
    expect(headers.Authorization).toBe(
      `hmac username="client-id", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`,
    );
  });

  it("encodes array query values into the request target used for signing", () => {
    const date = new Date("2020-10-28T06:23:23Z");
    const query = {
      ids: [1, 2],
      include_archive: false,
      search: "cash & bank",
    };
    const queryString = buildQueryString(query);
    const headers = createMekariHeaders(
      { clientId: "client-id", clientSecret: "secret" },
      {
        date,
        method: "GET",
        path: "/public/jurnal/api/v1/accounts",
        query,
      },
    );

    const httpDate = "Wed, 28 Oct 2020 06:23:23 GMT";
    const requestLine = `GET /public/jurnal/api/v1/accounts?${queryString} HTTP/1.1`;
    const signature = createHmac("sha256", "secret")
      .update(`date: ${httpDate}\n${requestLine}`)
      .digest("base64");

    expect(queryString).toBe(
      "ids=1&ids=2&include_archive=false&search=cash+%26+bank",
    );
    expect(headers.Authorization).toBe(
      `hmac username="client-id", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`,
    );
  });
});
