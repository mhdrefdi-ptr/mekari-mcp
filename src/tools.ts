import { z } from "zod";

import type {
  HttpMethod,
  MekariClient,
  MekariRequest,
  MekariToolResult,
} from "./client.js";

export type ParameterLocation = "path" | "query";
export type ParameterType =
  | "array"
  | "boolean"
  | "integer"
  | "number"
  | "object"
  | "string";

export interface GeneratedParameter {
  defaultValue?: unknown;
  description?: string;
  in: ParameterLocation;
  name: string;
  required: boolean;
  type: ParameterType;
}

export interface GeneratedOperation {
  bodyRequired: boolean;
  description?: string;
  hasBody: boolean;
  method: HttpMethod;
  moduleName: string;
  name: string;
  operationName: string;
  parameters: readonly GeneratedParameter[];
  path: string;
  sourceTag: string;
  title?: string;
}

export interface GeneratedModule {
  name: string;
  sourceTag: string;
  tools: ReadonlyArray<{
    method: HttpMethod;
    name: string;
    operationName: string;
    path: string;
    title?: string;
  }>;
}

export interface RegisterGeneratedToolOptions {
  enableDestructive?: boolean;
  enableMutations?: boolean;
  modules?: readonly string[];
}

export interface ToolRegistry {
  registerTool(
    name: string,
    config: {
      description?: string;
      inputSchema: z.ZodObject<Record<string, z.ZodType>>;
      title?: string;
    },
    handler: (args: Record<string, unknown>) => Promise<McpToolResponse>,
  ): unknown;
}

export interface McpToolResponse {
  content: Array<{ text: string; type: "text" }>;
  isError?: true;
  structuredContent: MekariToolResult;
}

export function registerOperations(
  registry: ToolRegistry,
  operations: readonly GeneratedOperation[],
  client: MekariClient,
  options: RegisterGeneratedToolOptions = {},
): number {
  let registered = 0;

  for (const operation of operations) {
    if (!isEnabled(operation, options)) {
      continue;
    }

    const inputSchema = buildInputSchema(operation);
    registry.registerTool(
      operation.name,
      {
        description: operation.description,
        inputSchema,
        title: operation.title,
      },
      async (args) => {
        const input = inputSchema.parse(args ?? {});
        const result = await client.request(toMekariRequest(operation, input));
        return toMcpToolResponse(result);
      },
    );
    registered += 1;
  }

  return registered;
}

export function buildInputSchema(
  operation: GeneratedOperation,
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};

  for (const parameter of operation.parameters) {
    shape[parameter.name] = parameterSchema(parameter);
  }

  if (operation.hasBody) {
    shape.data = operation.bodyRequired ? z.unknown() : z.unknown().optional();
  }

  return z.object(shape);
}

function parameterSchema(parameter: GeneratedParameter): z.ZodType {
  let schema: z.ZodType;

  switch (parameter.type) {
    case "array":
      schema = z.array(z.unknown());
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "integer":
      schema = z.number().int();
      break;
    case "number":
      schema = z.number();
      break;
    case "object":
      schema = z.record(z.string(), z.unknown());
      break;
    case "string":
      schema = z.string();
      break;
  }

  if (parameter.defaultValue !== undefined) {
    return schema.default(parameter.defaultValue);
  }

  return parameter.required ? schema : schema.optional();
}

function isEnabled(
  operation: GeneratedOperation,
  options: RegisterGeneratedToolOptions,
): boolean {
  if (options.modules?.length && !options.modules.includes(operation.moduleName)) {
    return false;
  }

  if (operation.method === "GET") {
    return true;
  }

  if (operation.method === "DELETE") {
    return Boolean(options.enableMutations && options.enableDestructive);
  }

  return Boolean(options.enableMutations);
}

function toMekariRequest(
  operation: GeneratedOperation,
  input: Record<string, unknown>,
): MekariRequest {
  const query: MekariRequest["query"] = {};

  for (const parameter of operation.parameters) {
    if (parameter.in === "query" && input[parameter.name] !== undefined) {
      query[parameter.name] = input[parameter.name] as never;
    }
  }

  return {
    data: operation.hasBody ? input.data : undefined,
    method: operation.method,
    path: renderPath(operation.path, input),
    query: Object.keys(query).length ? query : undefined,
  };
}

function renderPath(path: string, input: Record<string, unknown>): string {
  return path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    return encodeURIComponent(String(input[name]));
  });
}

function toMcpToolResponse(result: MekariToolResult): McpToolResponse {
  const response = {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
  };

  return result.ok ? response : { ...response, isError: true };
}
