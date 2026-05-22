import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { buildRequestTarget, createMekariHeaders, type QueryValue } from "./auth.js";

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface MekariClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  debugLogBodies?: boolean;
  logger?: MekariRuntimeLogger;
}

export interface MekariRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, QueryValue | null | undefined>;
  data?: unknown;
  upload?: MekariUploadRequest;
}

export interface MekariUploadRequest {
  fieldName: string;
  filePath: string;
}

export type MekariToolResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: unknown };

export interface MekariClient {
  request(request: MekariRequest): Promise<MekariToolResult>;
}

export type MekariRuntimeLogger = (line: string) => void;

export function createMekariClient(
  config: MekariClientConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): MekariClient {
  return {
    async request(request) {
      const startedAt = Date.now();

      try {
        const requestTarget = buildRequestTarget(request.path, request.query);
        const url = new URL(requestTarget, normalizeBaseUrl(config.baseUrl));
        const headers = createMekariHeaders(config, request);
        const body = await buildRequestBody(request, headers);

        const response = await fetchImpl(url, {
          body,
          headers,
          method: request.method,
        });
        const payload = await readPayload(response);
        logRequest(config, request, response.status, startedAt);

        if (!response.ok) {
          return { ok: false, status: response.status, error: payload };
        }

        return { ok: true, data: payload };
      } catch (error) {
        logRequest(config, request, 0, startedAt);

        return {
          ok: false,
          status: 0,
          error: { message: error instanceof Error ? error.message : String(error) },
        };
      }
    },
  };
}

async function buildRequestBody(
  request: MekariRequest,
  headers: Record<string, string>,
): Promise<RequestInit["body"] | undefined> {
  if (request.upload) {
    return buildUploadBody(request.upload);
  }

  if (request.data === undefined) {
    return undefined;
  }

  headers["Content-Type"] = "application/json";
  return JSON.stringify(request.data);
}

async function buildUploadBody(
  upload: MekariUploadRequest,
): Promise<FormData> {
  const bytes = await readFile(upload.filePath);
  const blob = new Blob([toArrayBuffer(bytes)], {
    type: detectContentType(upload.filePath),
  });
  const formData = new FormData();

  formData.append(upload.fieldName, blob, basename(upload.filePath));
  return formData;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function detectContentType(filePath: string): string {
  const lower = filePath.toLowerCase();

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  return "application/octet-stream";
}

function logRequest(
  config: MekariClientConfig,
  request: MekariRequest,
  status: number,
  startedAt: number,
): void {
  const durationMs = Math.max(0, Date.now() - startedAt);
  const parts = [
    "mekari_request",
    `method=${request.method}`,
    `path=${request.path}`,
    `status=${status}`,
    `duration_ms=${durationMs}`,
  ];

  if (config.debugLogBodies && request.data !== undefined) {
    parts.push(`body=${stringifyForLog(request.data)}`);
  }

  try {
    (config.logger ?? defaultLogger)(parts.join(" "));
  } catch {
    // Logging must never alter MCP Tool Result behavior.
  }
}

function defaultLogger(line: string): void {
  console.error(line);
}

function stringifyForLog(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
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
