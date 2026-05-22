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
        logger: () => undefined,
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
        logger: () => undefined,
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

  it("returns raw text payloads on non-JSON Mekari errors", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("rate limited", { status: 429 });
    }) as unknown as typeof fetch;
    const client = createMekariClient(
      {
        baseUrl: "https://api.mekari.test",
        clientId: "client-id",
        clientSecret: "secret",
        logger: () => undefined,
      },
      fetchImpl,
    );

    await expect(
      client.request({ method: "GET", path: "/public/jurnal/api/v1/accounts" }),
    ).resolves.toEqual({
      ok: false,
      status: 429,
      error: "rate limited",
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
        logger: () => undefined,
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

  it("returns successful text and empty responses without changing payload shape", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("accepted", { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })) as unknown as typeof fetch;
    const client = createMekariClient(
      {
        baseUrl: "https://api.mekari.test",
        clientId: "client-id",
        clientSecret: "secret",
        logger: () => undefined,
      },
      fetchImpl,
    );

    await expect(
      client.request({ method: "POST", path: "/public/jurnal/api/v1/ping" }),
    ).resolves.toEqual({ ok: true, data: "accepted" });
    await expect(
      client.request({ method: "DELETE", path: "/public/jurnal/api/v1/ping/1" }),
    ).resolves.toEqual({ ok: true, data: null });
  });

  it("logs method path status and duration without secrets or request body by default", async () => {
    const logs: string[] = [];
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: 1 }), { status: 201 });
    }) as unknown as typeof fetch;
    const client = createMekariClient(
      {
        baseUrl: "https://api.mekari.test",
        clientId: "client-id",
        clientSecret: "secret-value",
        logger: (line) => logs.push(line),
      },
      fetchImpl,
    );

    await client.request({
      data: { memo: "private body" },
      method: "POST",
      path: "/public/jurnal/api/v1/accounts",
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("method=POST");
    expect(logs[0]).toContain("path=/public/jurnal/api/v1/accounts");
    expect(logs[0]).toContain("status=201");
    expect(logs[0]).toMatch(/duration_ms=\d+/);
    expect(logs[0]).not.toContain("client-id");
    expect(logs[0]).not.toContain("secret-value");
    expect(logs[0]).not.toContain("Authorization");
    expect(logs[0]).not.toContain("private body");
  });

  it("logs request bodies only when debug body logging is enabled", async () => {
    const defaultLogs: string[] = [];
    const debugLogs: string[] = [];
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ id: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const baseConfig = {
      baseUrl: "https://api.mekari.test",
      clientId: "client-id",
      clientSecret: "secret",
    };

    await createMekariClient(
      { ...baseConfig, logger: (line) => defaultLogs.push(line) },
      fetchImpl,
    ).request({
      data: { memo: "debug body" },
      method: "PUT",
      path: "/public/jurnal/api/v1/accounts/1",
    });
    await createMekariClient(
      {
        ...baseConfig,
        debugLogBodies: true,
        logger: (line) => debugLogs.push(line),
      },
      fetchImpl,
    ).request({
      data: { memo: "debug body" },
      method: "PUT",
      path: "/public/jurnal/api/v1/accounts/1",
    });

    expect(defaultLogs[0]).not.toContain("debug body");
    expect(debugLogs[0]).toContain('"memo":"debug body"');
  });

  it("uses stderr instead of stdout for default runtime request logs", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
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

    try {
      await client.request({
        method: "GET",
        path: "/public/jurnal/api/v1/accounts",
      });

      expect(stderr).toHaveBeenCalledWith(
        expect.stringContaining("method=GET"),
      );
      expect(stdout).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
    }
  });
});
