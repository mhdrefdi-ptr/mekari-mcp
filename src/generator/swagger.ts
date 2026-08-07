import type {
  GeneratedModule,
  GeneratedOperation,
  GeneratedParameter,
  GeneratedSchema,
  GeneratedUpload,
  ParameterLocation,
  ParameterType,
} from "../tools.js";
import type { HttpMethod } from "../client.js";

const HTTP_METHODS = new Set(["delete", "get", "patch", "post", "put"]);

interface SwaggerParameter {
  default?: unknown;
  description?: string;
  example?: unknown;
  in?: string;
  name?: string;
  properties?: Record<string, SwaggerSchema>;
  required?: boolean;
  schema?: SwaggerSchema;
  type?: string | string[];
}

interface SwaggerSchema {
  description?: string;
  example?: unknown;
  format?: string;
  items?: SwaggerSchema;
  nullable?: boolean;
  properties?: Record<string, SwaggerSchema>;
  required?: string[] | boolean;
  type?: string | string[];
}

interface SwaggerOperation {
  description?: string;
  operationId?: string;
  parameters?: SwaggerParameter[] | null;
  responses?: Record<string, SwaggerResponse>;
  summary?: string;
  tags?: string[];
}

interface SwaggerResponse {
  examples?: Record<string, unknown>;
}

interface SwaggerPathItem {
  parameters?: SwaggerParameter[] | null;
  [method: string]: SwaggerOperation | SwaggerParameter[] | null | undefined;
}

interface SwaggerDocument {
  paths?: Record<string, SwaggerPathItem>;
}

export interface ToolNameInput {
  method: string;
  moduleName: string;
  operationId?: string;
  path: string;
  summary?: string;
}

export interface SplitSwaggerPath {
  path: string;
  queryParameters: Array<{ defaultValue: string; name: string }>;
}

export function normalizeModuleName(tag: string): string {
  return normalizeIdentifier(tag.replace(/\[|\]/g, " "));
}

export function normalizeToolName(input: ToolNameInput): string {
  return `${input.moduleName}_${normalizeOperationName(input)}`;
}

export function splitSwaggerPath(rawPath: string): SplitSwaggerPath {
  const [path = rawPath, queryString] = rawPath.split("?");

  if (!queryString) {
    return { path, queryParameters: [] };
  }

  const params = new URLSearchParams(queryString);
  return {
    path,
    queryParameters: Array.from(params.entries()).map(([name, defaultValue]) => ({
      defaultValue,
      name,
    })),
  };
}

export function buildOperationsFromSwagger(
  swagger: SwaggerDocument,
): GeneratedOperation[] {
  const operations: GeneratedOperation[] = [];
  const seenNames = new Map<string, number>();

  for (const [rawPath, pathItem] of Object.entries(swagger.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    const splitPath = splitSwaggerPath(rawPath);
    const pathParameters = Array.isArray(pathItem.parameters)
      ? pathItem.parameters
      : [];

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !isSwaggerOperation(operation)) {
        continue;
      }

      const sourceTag = operation.tags?.[0];
      if (!sourceTag) {
        continue;
      }

      const moduleName = normalizeModuleName(sourceTag);
      const operationName = normalizeOperationName({
        method,
        moduleName,
        operationId: operation.operationId,
        path: splitPath.path,
        summary: operation.summary,
      });
      const baseName = `${moduleName}_${operationName}`;
      const name = uniqueToolName(baseName, splitPath.path, seenNames);
      const upload = detectUpload(operation, splitPath.path);
      const docsExamples = collectDocsExamples(operation);
      const bodyParameter = upload
        ? undefined
        : (operation.parameters ?? []).find(
            (parameter) => parameter?.in === "body",
          );

      operations.push({
        bodyRequired: Boolean(bodyParameter?.required),
        bodySchema: bodyParameter?.schema
          ? normalizeSchema(bodyParameter.schema)
          : undefined,
        description: operation.description,
        docsExamples: docsExamples.length ? docsExamples : undefined,
        hasBody: Boolean(bodyParameter),
        method: method.toUpperCase() as HttpMethod,
        moduleName,
        name,
        operationName,
        parameters: applyOperationParameterDefaults(
          splitPath.path,
          collectParameters(
            splitPath.path,
            splitPath.queryParameters,
            pathParameters,
            operation.parameters ?? [],
          ),
        ),
        path: splitPath.path,
        safetyLevel: classifySafetyLevel(method, splitPath.path, operationName),
        sourceTag,
        title: operation.summary,
        upload,
      });
    }
  }

  return operations;
}

export function buildGeneratedModules(
  operations: readonly GeneratedOperation[],
): GeneratedModule[] {
  const modules = new Map<
    string,
    GeneratedModule & { tools: GeneratedModule["tools"] }
  >();

  for (const operation of operations) {
    const existing =
      modules.get(operation.moduleName) ??
      ({
        name: operation.moduleName,
        sourceTag: operation.sourceTag,
        tools: [],
      } satisfies GeneratedModule);

    existing.tools = [
      ...existing.tools,
      {
        method: operation.method,
        name: operation.name,
        operationName: operation.operationName,
        path: operation.path,
        safetyLevel: operation.safetyLevel,
        title: operation.title,
      },
    ];
    modules.set(operation.moduleName, existing);
  }

  return Array.from(modules.values());
}

export function emitGeneratedTools(
  operations: readonly GeneratedOperation[],
): string {
  const modules = buildGeneratedModules(operations);
  const runtimeOperations = operations.map(
    ({ docsExamples: _docsExamples, ...operation }) => operation,
  );

  return `/* This file is generated by scripts/generate.ts. Do not edit manually. */
import type { MekariClient } from "../client.js";
import { registerOperations, type GeneratedModule, type GeneratedOperation, type RegisterGeneratedToolOptions, type ToolRegistry } from "../tools.js";

export const generatedModules = ${JSON.stringify(modules, null, 2)} as const satisfies readonly GeneratedModule[];

export const generatedOperations = ${JSON.stringify(runtimeOperations, null, 2)} as const satisfies readonly GeneratedOperation[];

export function registerGeneratedTools(
  registry: ToolRegistry,
  client: MekariClient,
  options: RegisterGeneratedToolOptions = {},
): number {
  return registerOperations(registry, generatedOperations, client, options);
}
`;
}

export function emitGeneratedToolDocs(
  operations: readonly GeneratedOperation[],
): string {
  const lines = [
    "# Mekari Jurnal MCP Modules and Tools",
    "",
    "Generated from `docs/mekari.swagger.json`. Do not edit manually.",
    "",
    "## Runtime gates",
    "",
    "- Read tools register by default.",
    "- Mutation tools require `MEKARI_ENABLE_MUTATIONS=true`.",
    "- Destructive tools require `MEKARI_ENABLE_MUTATIONS=true` and `MEKARI_ENABLE_DESTRUCTIVE=true`.",
    "- Module filtering uses `MEKARI_MODULES=accounts,customers` with normalized module names.",
    "",
  ];

  for (const module of groupOperationsByModule(operations)) {
    lines.push(`## Module \`${module.name}\``, "");
    lines.push(`Source Swagger tag: \`${module.sourceTag}\``, "");

    for (const operation of module.operations) {
      lines.push(`### \`${operation.name}\``, "");
      lines.push(`- Method: \`${operation.method}\``);
      lines.push(`- Path: \`${operation.path}\``);
      lines.push(
        `- Summary: ${formatInlineText(operation.title ?? operation.description ?? operation.name)}`,
      );
      lines.push(`- Safety: \`${operation.safetyLevel}\``);
      lines.push("- Input overview:");

      for (const inputLine of buildInputOverview(operation)) {
        lines.push(`  ${inputLine}`);
      }

      if (operation.docsExamples?.length) {
        lines.push("", "#### Swagger Examples", "");

        for (const example of operation.docsExamples) {
          lines.push(`${example.title}:`, "", "```json");
          lines.push(JSON.stringify(example.value, null, 2));
          lines.push("```", "");
        }
      } else {
        lines.push("");
      }
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function groupOperationsByModule(
  operations: readonly GeneratedOperation[],
): Array<{
  name: string;
  operations: GeneratedOperation[];
  sourceTag: string;
}> {
  const modules = new Map<
    string,
    { name: string; operations: GeneratedOperation[]; sourceTag: string }
  >();

  for (const operation of operations) {
    const module =
      modules.get(operation.moduleName) ??
      ({
        name: operation.moduleName,
        operations: [],
        sourceTag: operation.sourceTag,
      } satisfies {
        name: string;
        operations: GeneratedOperation[];
        sourceTag: string;
      });

    module.operations.push(operation);
    modules.set(operation.moduleName, module);
  }

  return Array.from(modules.values());
}

function buildInputOverview(operation: GeneratedOperation): string[] {
  const lines: string[] = [];

  for (const parameter of operation.parameters) {
    lines.push(formatParameterOverview(parameter));
  }

  if (operation.hasBody) {
    const requiredFields = collectRequiredFields(operation.bodySchema);
    const bodyLine = [
      `- Body \`data\`: ${operation.bodySchema?.type ?? "unknown"}`,
      operation.bodyRequired ? "required" : "optional",
    ];
    lines.push(bodyLine.join(", "));

    if (requiredFields.length) {
      lines.push(`  Required fields: ${formatCodeList(requiredFields)}`);
    }
  }

  if (operation.upload) {
    lines.push(
      `- File \`file_path\`: string, required; multipart field \`${operation.upload.fieldName}\``,
    );
  }

  return lines.length ? lines : ["- None"];
}

function formatParameterOverview(parameter: GeneratedParameter): string {
  const parts = [
    `- ${capitalize(parameter.in)} \`${parameter.name}\`: ${parameter.type}`,
    parameter.required ? "required" : "optional",
  ];

  if (parameter.defaultValue !== undefined) {
    parts.push(`default \`${String(parameter.defaultValue)}\``);
  }

  if (parameter.description) {
    parts.push(formatInlineText(parameter.description));
  }

  return parts.join(", ");
}

function collectRequiredFields(
  schema: GeneratedSchema | undefined,
  prefix = "",
): string[] {
  if (!schema || schema.type !== "object") {
    return [];
  }

  const fields: string[] = [];

  for (const name of schema.required ?? []) {
    const path = prefix ? `${prefix}.${name}` : name;
    fields.push(path);
    fields.push(...collectRequiredFields(schema.properties?.[name], path));
  }

  return fields;
}

function formatCodeList(values: readonly string[]): string {
  const visible = values.slice(0, 20).map((value) => `\`${value}\``);

  if (values.length > visible.length) {
    visible.push(`\`${values.length - visible.length} more\``);
  }

  return visible.join(", ");
}

function collectDocsExamples(
  operation: SwaggerOperation,
): NonNullable<GeneratedOperation["docsExamples"]> {
  const examples: Array<{ title: string; value: unknown }> = [];

  for (const parameter of operation.parameters ?? []) {
    const example = parameter?.example ?? parameter?.schema?.example;
    if (parameter?.in === "body" && example !== undefined) {
      examples.push({
        title: "Request body example",
        value: example,
      });
    }
  }

  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    for (const [contentType, value] of Object.entries(response.examples ?? {})) {
      examples.push({
        title: `Response \`${status}\` \`${contentType}\``,
        value,
      });
    }
  }

  return examples;
}

function formatInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function normalizeOperationName(input: ToolNameInput): string {
  const method = input.method.toUpperCase();
  const operationId = normalizeIdentifier(input.operationId ?? "");
  const hasPathParameter = /\{[^}]+\}/.test(input.path);

  if (method === "GET") {
    if (hasPathParameter) {
      return "get";
    }

    if (!operationId || operationId === "index" || operationId === "list") {
      return "list";
    }

    if (operationId === "show" || operationId === "get_show") {
      return "get";
    }

    if (operationId.startsWith("get_authorization_path")) {
      return pathAction(input.path) ?? operationId;
    }

    return operationId;
  }

  if (method === "POST") {
    return operationId || "create";
  }

  if (method === "PATCH" || method === "PUT") {
    return operationId || "update";
  }

  if (method === "DELETE") {
    return "delete";
  }

  return operationId || pathAction(input.path) || method.toLowerCase();
}

function classifySafetyLevel(
  method: string,
  path: string,
  operationName: string,
): GeneratedOperation["safetyLevel"] {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "GET") {
    return "read";
  }

  if (normalizedMethod === "DELETE") {
    return "destructive";
  }

  const action = `${operationName} ${pathAction(path) ?? ""}`.toLowerCase();
  if (
    /\b(deactivate|delete|destroy|remove|remove_logo|remove_product_image|archive)\b/.test(
      action,
    )
  ) {
    return "destructive";
  }

  return "mutation";
}

function collectParameters(
  path: string,
  malformedQueryParameters: SplitSwaggerPath["queryParameters"],
  pathParameters: SwaggerParameter[],
  operationParameters: SwaggerParameter[],
): GeneratedParameter[] {
  const parameters = new Map<string, GeneratedParameter>();

  for (const parameter of malformedQueryParameters) {
    parameters.set(parameter.name, {
      defaultValue: parameter.defaultValue,
      in: "query",
      name: parameter.name,
      required: false,
      type: "string",
    });
  }

  for (const parameter of [...pathParameters, ...operationParameters]) {
    const normalized = normalizeParameter(parameter);
    if (!normalized) {
      continue;
    }

    const existing = parameters.get(normalized.name);
    if (existing?.in === "path") {
      continue;
    }

    parameters.set(normalized.name, {
      ...existing,
      ...normalized,
      defaultValue: existing?.defaultValue ?? normalized.defaultValue,
    });
  }

  for (const name of extractPathParameters(path)) {
    if (!parameters.has(name)) {
      parameters.set(name, {
        in: "path",
        name,
        required: true,
        type: "string",
      });
    }
  }

  return Array.from(parameters.values());
}

function applyOperationParameterDefaults(
  path: string,
  parameters: readonly GeneratedParameter[],
): GeneratedParameter[] {
  if (path !== "/public/jurnal/api/v1/purchase_delivery_reports/export") {
    return [...parameters];
  }

  return parameters.map((parameter) => {
    if (
      parameter.in === "query" &&
      parameter.name === "detail" &&
      parameter.defaultValue === undefined
    ) {
      return {
        ...parameter,
        defaultValue: true,
      };
    }

    return parameter;
  });
}

function normalizeParameter(
  parameter: SwaggerParameter | null | undefined,
): GeneratedParameter | undefined {
  if (!parameter?.name) {
    return undefined;
  }

  if (parameter.in !== "path" && parameter.in !== "query") {
    return undefined;
  }

  return {
    defaultValue: parameter.default,
    description: parameter.description,
    in: parameter.in as ParameterLocation,
    name: parameter.name,
    required: parameter.in === "path" || Boolean(parameter.required),
    type: normalizeParameterType(parameter.schema?.type ?? parameter.type),
  };
}

function detectUpload(
  operation: SwaggerOperation,
  path: string,
): GeneratedUpload | undefined {
  for (const parameter of operation.parameters ?? []) {
    if (parameter?.in !== "formData" || !parameter.name) {
      continue;
    }

    if (hasFileType(parameter.type)) {
      return { fieldName: parameter.name };
    }

    for (const [propertyName, propertySchema] of Object.entries(
      parameter.properties ?? {},
    )) {
      if (hasFileType(propertySchema.type)) {
        return { fieldName: `${parameter.name}[${propertyName}]` };
      }
    }
  }

  if (!/upload/i.test(path)) {
    return undefined;
  }

  const bodyParameter = (operation.parameters ?? []).find(
    (parameter) => parameter?.in === "body",
  );

  for (const [rootName, rootSchema] of Object.entries(
    bodyParameter?.schema?.properties ?? {},
  )) {
    for (const [propertyName, propertySchema] of Object.entries(
      rootSchema.properties ?? {},
    )) {
      if (
        propertySchema.type === "string" &&
        /(image|logo)(?:_url)?$/i.test(propertyName)
      ) {
        return {
          fieldName: `${rootName}[${propertyName.replace(/_url$/i, "")}]`,
        };
      }
    }
  }

  return undefined;
}

function hasFileType(type: string | string[] | undefined): boolean {
  return Array.isArray(type) ? type.includes("file") : type === "file";
}

function normalizeParameterType(type: string | string[] | undefined): ParameterType {
  const actualType = Array.isArray(type)
    ? type.find((item) => item !== "null")
    : type;

  if (
    actualType === "array" ||
    actualType === "boolean" ||
    actualType === "integer" ||
    actualType === "number" ||
    actualType === "object" ||
    actualType === "string"
  ) {
    return actualType;
  }

  return "string";
}

function normalizeSchema(schema: SwaggerSchema): GeneratedSchema {
  const type = normalizeSchemaType(schema);
  const description = schema.description;

  if (type === "array") {
    return removeUndefined({
      description,
      items: schema.items ? normalizeSchema(schema.items) : undefined,
      nullable: isNullableSchema(schema) ? true : undefined,
      type,
    });
  }

  if (type === "object") {
    const properties = Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([name, propertySchema]) => [
        name,
        normalizeSchema(propertySchema),
      ]),
    );
    const required = Array.isArray(schema.required) ? schema.required : [];

    return removeUndefined({
      description,
      nullable: isNullableSchema(schema) ? true : undefined,
      properties: Object.keys(properties).length ? properties : undefined,
      required: required.length ? required : undefined,
      type,
    });
  }

  return removeUndefined({
    description,
    nullable: isNullableSchema(schema) ? true : undefined,
    type,
  });
}

function normalizeSchemaType(schema: SwaggerSchema): GeneratedSchema["type"] {
  const rawType = Array.isArray(schema.type)
    ? (schema.type.find((item) => item !== "null") ?? schema.type[0])
    : schema.type;

  if (
    rawType === "array" ||
    rawType === "boolean" ||
    rawType === "integer" ||
    rawType === "null" ||
    rawType === "number" ||
    rawType === "object" ||
    rawType === "string"
  ) {
    return rawType;
  }

  if (schema.properties) {
    return "object";
  }

  if (schema.items) {
    return "array";
  }

  return "unknown";
}

function isNullableSchema(schema: SwaggerSchema): boolean {
  return (
    schema.nullable === true ||
    (Array.isArray(schema.type) && schema.type.includes("null"))
  );
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function normalizeIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function pathAction(path: string): string | undefined {
  const lastSegment = path.split("/").filter(Boolean).at(-1);
  if (!lastSegment || lastSegment.includes("{")) {
    return undefined;
  }

  return normalizeIdentifier(lastSegment);
}

function extractPathParameters(path: string): string[] {
  return Array.from(path.matchAll(/\{([^}]+)\}/g)).map((match) => match[1] ?? "");
}

function uniqueToolName(
  baseName: string,
  path: string,
  seenNames: Map<string, number>,
): string {
  const count = seenNames.get(baseName) ?? 0;
  seenNames.set(baseName, count + 1);

  if (count === 0) {
    return baseName;
  }

  const suffix = pathAction(path) ?? String(count + 1);
  const candidate = `${baseName}_${suffix}`;

  if (!seenNames.has(candidate)) {
    seenNames.set(candidate, 1);
    return candidate;
  }

  return `${baseName}_${count + 1}`;
}

function isSwaggerOperation(value: unknown): value is SwaggerOperation {
  return Boolean(value && typeof value === "object" && "tags" in value);
}
