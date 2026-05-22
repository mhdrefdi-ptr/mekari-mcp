import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  buildOperationsFromSwagger,
  emitGeneratedTools,
} from "../src/generator/swagger.js";

const swaggerPath = resolve("docs/mekari.swagger.json");
const outputPath = resolve("src/generated/tools.ts");

const swagger = JSON.parse(await readFile(swaggerPath, "utf8"));
const operations = buildOperationsFromSwagger(swagger);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, emitGeneratedTools(operations));
