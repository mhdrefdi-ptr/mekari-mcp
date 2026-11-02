import { describe, expect, it, vi } from "vitest";
import { generatedOperations, registerGeneratedTools } from "../src/generated/tools.js";
import { buildInputSchema, type ToolRegistry } from "../src/tools.js";
import { createMekariClient } from "../src/client.js";

describe("report and transaction inputs", () => {
  it("normalizes unpublished ledger fields and keeps account/date filters", () => {
    const operation = generatedOperations.find((item) => item.name === "general_ledger_get_api_v1_general_ledger")!;
    const schema = buildInputSchema(operation);
    expect(Object.keys(schema.shape)).toEqual([
      "start_date", "end_date", "compare_type", "account_id", "tag_ids", "tag_logic",
    ]);
    expect(schema.shape.tag_ids?.description).toContain("temporarily unavailable");
    expect(schema.parse({ account_id: "123", start_date: "01/01/2025", end_date: "31/01/2025", compare_type: "custom" })).toMatchObject({ account_id: "123", compare_type: "custom" });
  });

  it.each(["bank_withdrawals_list", "journal_entries_list", "purchase_invoices_list", "sales_invoices_list"])("forwards %s filters and pagination alias", async (name) => {
    const handlers = new Map<string, any>();
    const registry: ToolRegistry = { registerTool(name, _config, handler) { handlers.set(name, handler); } };
    const client = { request: vi.fn(async () => ({ ok: true as const, data: {} })) };
    registerGeneratedTools(registry, client);
    await handlers.get(name)({ page: 2, per_page: 20, start_date: "01/01/2025", end_date: "31/01/2025" });
    expect(client.request.mock.calls[0]).toEqual([expect.objectContaining({ query: {
      page: 2, page_size: 20, start_date: "01/01/2025", end_date: "31/01/2025",
    } })]);
    await expect(handlers.get(name)({ per_page: 20, page_size: 10 })).rejects.toThrow("not both");
    await expect(handlers.get(name)({ page: 0 })).rejects.toThrow();
  });
});

describe("export downloads", () => {
  const url = "https://jurnal-quickbook-s3.s3-ap-southeast-1.amazonaws.com/report.csv?signature=secret";
  const request = { method: "GET" as const, path: "/public/jurnal/api/v1/general_ledger/export" };
  function client(fetchImpl: typeof fetch) {
    return createMekariClient({ baseUrl: "https://api.mekari.com", clientId: "id", clientSecret: "secret", logger: () => {} }, fetchImpl);
  }

  it("downloads CSV without forwarding HMAC headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ url }))
      .mockResolvedValueOnce(new Response("date,amount\n2025-01-01,100", { headers: { "content-type": "text/csv" } }));
    const result = await client(fetchImpl).request(request);
    expect(result).toMatchObject({ ok: true, data: { url, file: { encoding: "utf8", content: "date,amount\n2025-01-01,100" } } });
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ method: "GET", redirect: "error" });
    expect(fetchImpl.mock.calls[1]?.[1]).not.toHaveProperty("headers");
  });

  it("preserves direct binary exports as base64", async () => {
    const bytes = new Uint8Array([0, 255, 128, 65]);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes, { headers: { "content-type": "application/pdf" } }));
    expect(await client(fetchImpl).request(request)).toMatchObject({ ok: true, data: { file: { encoding: "base64", content: Buffer.from(bytes).toString("base64"), size: 4 } } });
  });

  it.each(["http://127.0.0.1/private", "https://evil.test/report", "https://jurnal-quickbook-s3.s3-ap-southeast-1.amazonaws.com.evil.test/report", "https://user:pass@jurnal-quickbook-s3.s3-ap-southeast-1.amazonaws.com/report"])("blocks untrusted URL %s", async (url) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ url }));
    expect(await client(fetchImpl).request(request)).toMatchObject({ ok: false, error: { message: "Untrusted export URL host" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports download failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ url })).mockResolvedValueOnce(new Response("expired", { status: 403 }));
    expect(await client(fetchImpl).request(request)).toMatchObject({ ok: false, error: { message: "Export download failed: HTTP 403" } });
  });

  it.each([true, false])("limits files with content-length present=%s", async (declared) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ url })).mockResolvedValueOnce(new Response(new Uint8Array(10 * 1024 * 1024 + 1), { headers: declared ? { "content-length": String(10 * 1024 * 1024 + 1) } : {} }));
    expect(await client(fetchImpl).request(request)).toMatchObject({ ok: false, error: { message: "Export exceeds 10 MiB limit" } });
  });

  it("does not download links from non-export responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ url }));
    expect(await client(fetchImpl).request({ ...request, path: "/public/jurnal/api/v1/accounts" })).toEqual({ ok: true, data: { url } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
