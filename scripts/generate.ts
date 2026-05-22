import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildOperationsFromSwagger,
  emitGeneratedToolDocs,
  emitGeneratedTools,
} from "../src/generator/swagger.js";

const swaggerPath = resolve("docs/mekari.swagger.json");
const toolsOutputPath = resolve("src/generated/tools.ts");
const docsOutputPath = resolve("docs/generated/mekari-tools.md");

const swagger = JSON.parse(await readFile(swaggerPath, "utf8"));
const operations = buildOperationsFromSwagger(swagger);

await mkdir(dirname(toolsOutputPath), { recursive: true });
await writeFile(toolsOutputPath, emitGeneratedTools(operations));

await mkdir(dirname(docsOutputPath), { recursive: true });
await writeFile(docsOutputPath, emitGeneratedToolDocs(operations));
