import type { MekariClientConfig } from "./client.js";
import type { RegisterGeneratedToolOptions } from "./tools.js";

export interface MekariConfig
  extends MekariClientConfig,
    RegisterGeneratedToolOptions {}

export function loadMekariConfig(
  env: NodeJS.ProcessEnv = process.env,
): MekariConfig {
  const clientId = env.MEKARI_CLIENT_ID;
  const clientSecret = env.MEKARI_CLIENT_SECRET;

  if (!clientId) {
    throw new Error("MEKARI_CLIENT_ID is required");
  }

  if (!clientSecret) {
    throw new Error("MEKARI_CLIENT_SECRET is required");
  }

  return {
    baseUrl: env.MEKARI_BASE_URL ?? "https://api.mekari.com",
    clientId,
    clientSecret,
    enableDestructive: env.MEKARI_ENABLE_DESTRUCTIVE === "true",
    enableMutations: env.MEKARI_ENABLE_MUTATIONS === "true",
    modules: parseModules(env.MEKARI_MODULES),
  };
}

function parseModules(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const modules = value
    .split(",")
    .map((moduleName) => moduleName.trim())
    .filter(Boolean);

  return modules.length ? modules : undefined;
}
