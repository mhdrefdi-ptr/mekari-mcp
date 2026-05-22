import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";

describe("stdio server startup", () => {
  it("does not write non-protocol startup logs to stdout", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MEKARI_CLIENT_ID: "client-id",
        MEKARI_CLIENT_SECRET: "secret",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    await new Promise((resolve) => setTimeout(resolve, 250));

    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
    }

    expect(stdout).toBe("");
    expect(stderr).not.toContain("MEKARI_CLIENT_SECRET");
  });
});
