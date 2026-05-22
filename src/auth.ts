import { createHmac } from "node:crypto";

export type QueryValue = boolean | number | string | Array<boolean | number | string>;

export interface MekariCredentials {
  clientId: string;
  clientSecret: string;
}

export interface SignedRequest {
  method: string;
  path: string;
  query?: Record<string, QueryValue | null | undefined>;
  date?: Date;
}

export function buildQueryString(
  query: Record<string, QueryValue | null | undefined> = {},
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
      continue;
    }

    params.append(key, String(value));
  }

  return params.toString();
}

export function buildRequestTarget(
  path: string,
  query?: Record<string, QueryValue | null | undefined>,
): string {
  const queryString = buildQueryString(query);
  return queryString ? `${path}?${queryString}` : path;
}

export function createMekariHeaders(
  credentials: MekariCredentials,
  request: SignedRequest,
): Record<string, string> {
  const httpDate = (request.date ?? new Date()).toUTCString();
  const requestTarget = buildRequestTarget(request.path, request.query);
  const requestLine = `${request.method.toLowerCase()} ${requestTarget} HTTP/1.1`;
  const signingString = `date: ${httpDate}\n${requestLine}`;
  const signature = createHmac("sha256", credentials.clientSecret)
    .update(signingString)
    .digest("base64");

  return {
    Authorization: `hmac username="${credentials.clientId}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`,
    Date: httpDate,
  };
}
