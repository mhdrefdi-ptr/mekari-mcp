import { buildRequestTarget, createMekariHeaders, type QueryValue } from "./auth.js";

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface MekariClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface MekariRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, QueryValue | null | undefined>;
  data?: unknown;
}

export type MekariToolResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: unknown };

export interface MekariClient {
  request(request: MekariRequest): Promise<MekariToolResult>;
}

export function createMekariClient(
  config: MekariClientConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): MekariClient {
  return {
    async request(request) {
      try {
        const requestTarget = buildRequestTarget(request.path, request.query);
        const url = new URL(requestTarget, normalizeBaseUrl(config.baseUrl));
        const headers = createMekariHeaders(config, request);

        if (request.data !== undefined) {
          headers["Content-Type"] = "application/json";
        }

        const response = await fetchImpl(url, {
          body:
            request.data === undefined ? undefined : JSON.stringify(request.data),
          headers,
          method: request.method,
        });
        const payload = await readPayload(response);

        if (!response.ok) {
          return { ok: false, status: response.status, error: payload };
        }

        return { ok: true, data: payload };
      } catch (error) {
        return {
          ok: false,
          status: 0,
          error: { message: error instanceof Error ? error.message : String(error) },
        };
      }
    },
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
