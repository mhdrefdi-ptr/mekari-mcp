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

## Server

```bash
pnpm run build
node dist/src/index.js
```

The server uses stdio transport and writes no startup logs to stdout. Read operations register by default. Mutations require `MEKARI_ENABLE_MUTATIONS=true`; deletes also require `MEKARI_ENABLE_DESTRUCTIVE=true`. Use `MEKARI_MODULES=accounts,customers` to narrow registered modules.
