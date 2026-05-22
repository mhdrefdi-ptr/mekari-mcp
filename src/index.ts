import { runStdioServer } from "./server.js";

runStdioServer().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
