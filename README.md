# Mekari Jurnal MCP

Generator-first MCP server for Mekari Jurnal API-to-MCP Translation.

## Setup

```bash
corepack enable
pnpm install
pnpm run generate
cp .env.example .env
```

Set `MEKARI_CLIENT_ID` and `MEKARI_CLIENT_SECRET` in `.env`. Credentials are env-only and never accepted as MCP Tool Input.

## Development

```bash
pnpm run test
pnpm run typecheck
pnpm run build
```

Generated tools live in `src/generated/`. Manual config, auth, client, and server code stays outside that directory.

Generated module/tool docs live in [`docs/generated/mekari-tools.md`](docs/generated/mekari-tools.md). Regenerate code and docs with:

```bash
pnpm run generate
```

Local smoke checks:

```bash
pnpm run test
pnpm run typecheck
```

The generated docs list every Swagger-backed MCP Module, source tag, generated MCP Tool Name, method, path, summary, safety level, input overview, and available Swagger examples. Runtime tool descriptions stay concise and keep large examples/schemas out of MCP registry metadata.

## Server

```bash
pnpm run build
node dist/src/index.js
```

The server uses stdio transport and writes no startup logs to stdout. Read operations register by default. Mutations require `MEKARI_ENABLE_MUTATIONS=true`; destructive operations require `MEKARI_ENABLE_DESTRUCTIVE=true` too. Use `MEKARI_MODULES=accounts,customers` to narrow registered modules.

Runtime request logs go to stderr and include method, path, status, and duration. Authorization headers, client secrets, and request bodies are omitted by default. Set `MEKARI_DEBUG_LOG_BODIES=true` only for local diagnostics when request body logging is acceptable.

Upload tools such as product image and company logo accept local `file_path`. The server reads the file and sends `multipart/form-data` to Mekari Jurnal; base64 upload payloads are not supported. Upload tools are mutations, so set `MEKARI_ENABLE_MUTATIONS=true` before registering them.
