import { describe, expect, it, vi } from "vitest";

import { createMekariClient } from "../src/client.js";

describe("Mekari client result wrappers", () => {
  it("returns ok data on successful Mekari responses", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createMekariClient(
      {
        baseUrl: "https://api.mekari.test",
        clientId: "client-id",
        clientSecret: "secret",
      },
      fetchImpl,
    );

    await expect(
      client.request({
        method: "GET",
        path: "/public/jurnal/api/v1/accounts",
        query: { include_archive: false },
      }),
    ).resolves.toEqual({ ok: true, data: { accounts: [] } });
  });

  it("returns status and raw error on Mekari errors", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "invalid" }), {
        status: 422,
      });
    }) as unknown as typeof fetch;
    const client = createMekariClient(
      {
        baseUrl: "https://api.mekari.test",
        clientId: "client-id",
        clientSecret: "secret",
      },
      fetchImpl,
    );

    await expect(
      client.request({ method: "GET", path: "/public/jurnal/api/v1/accounts" }),
    ).resolves.toEqual({
      ok: false,
      status: 422,
      error: { message: "invalid" },
    });
  });

  it("returns status 0 on network errors", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const client = createMekariClient(
      {
        baseUrl: "https://api.mekari.test",
        clientId: "client-id",
        clientSecret: "secret",
      },
      fetchImpl,
    );

    await expect(
      client.request({ method: "GET", path: "/public/jurnal/api/v1/accounts" }),
    ).resolves.toEqual({
      ok: false,
      status: 0,
      error: { message: "offline" },
    });
  });
});
