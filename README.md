# Mekari Jurnal MCP

Connect Claude Desktop, Cursor, or another stdio-compatible MCP client to Mekari Jurnal. Read accounts, invoices, customers, products, and reports, with optional write and destructive operations.

Tools are generated from the bundled Swagger specification. Each tool maps directly to a Mekari Jurnal API operation; the server does not add business workflows or support other Mekari products.

---

## Quick Start

### 1. Install and Build

Requirements: **Node.js 22+**, **pnpm 11.2.2**, and a Mekari Client ID and Client Secret with access to the required Mekari Jurnal APIs.

From the repository root:

```bash
corepack enable
pnpm install
pnpm run generate
pnpm run build
```

If Corepack is unavailable, install pnpm 11.2.2 separately before continuing. This project runs from source; the package is private and does not provide an npm/npx installation.

### 2. Configure Credentials

```bash
cp .env.example .env
```

Set these values in `.env`:

```dotenv
MEKARI_CLIENT_ID=your-client-id
MEKARI_CLIENT_SECRET=your-client-secret
```

The server signs requests using HMAC-SHA256. Credentials belong in the server environment, never in prompts or MCP Tool Inputs. No browser sign-in or OAuth token setup is required.

### 3. Add to Your MCP Client

For clients accepting an `mcpServers` configuration, such as Claude Desktop or Cursor:

```json
{
  "mcpServers": {
    "mekari-jurnal": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/mekari-mcp/.env",
        "/absolute/path/to/mekari-mcp/dist/src/index.js"
      ]
    }
  }
}
```

Replace both paths with your local paths. On Windows, use forward slashes or escaped backslashes in JSON paths. If your client cannot find `node`, use its absolute executable path.

Restart or reload your MCP client. Read tools register by default; this setup does not enable write access.

Alternatively, provide credentials through the client's server `env` block and omit the `--env-file` argument.

> `.env` is not loaded automatically. Use `--env-file` or provide environment variables explicitly.

---

## What Can It Do?

The current generated catalog contains **415 tools across 93 MCP Modules**: **217 read**, **146 mutation**, and **52 destructive** tools. Registered tools depend on your module filter and safety settings; API access also depends on your Mekari credentials.

### Accounts and Contacts

| Tool | Description |
| --- | --- |
| `accounts_list` | List accounts, optionally excluding archived accounts |
| `customers_list` | List customers, optionally excluding archived customers |

### Sales and Purchases

| Tool | Description |
| --- | --- |
| `sales_invoices_list` | List sales invoices with pagination and sorting inputs |
| `purchase_invoices_list` | List purchase invoices |
| `expenses_list` | List expenses |

### Products and Accounting

| Tool | Description |
| --- | --- |
| `products_list` | List products, optionally excluding archived products |
| `journal_entries_list` | List journal entries |
| `balance_sheet_list` | Read balance sheet information |

Other modules cover payments, orders, deliveries, warehouses, inventory, and financial reports. Write operations include creation, updates, and local-file uploads; destructive operations require an additional opt-in.

See the [complete tool catalog](docs/generated/mekari-tools.md) for every tool's module, API method/path, safety level, inputs, and available Swagger examples. Module boundaries follow Swagger tags exactly, including separate `product_unit` and `scm_product_unit` modules.

---

## Usage Examples

### Read Data

```text
"List my non-archived Mekari Jurnal accounts."
"Show my customers, excluding archived customers."
"Get the first page of sales invoices, with 20 items per page."
"List purchase invoices."
"Show my products, excluding archived products."
"Get the balance sheet as of 2026-03-31."
```

Your MCP client translates these requests into tool calls. For example, `accounts_list` accepts:

```json
{
  "include_archive": false
}
```

`sales_invoices_list` uses string pagination parameters from the source specification:

```json
{
  "page": "1",
  "page_size": "20"
}
```

### Write Data

Enable mutations first, then ask your client to inspect the relevant tool schema before preparing a change:

```text
"Prepare a new sales invoice using these details. Show me the proposed input before submitting it."
"Upload this local image as the product image using the matching upload tool."
```

Path and query parameters sit at the top level of MCP Tool Input. Request bodies go under `data`; upload tools require `file_path`. Required fields vary by operation.

**Safety:** The server does not implement a confirmation workflow. Asking your client to show a proposed change is not an enforced approval step. Enable write access only when you intend to allow changes.

### Results and Pagination

Successful tools preserve the raw API response under `data`:

```json
{ "ok": true, "data": {} }
```

Failures return `ok: false`, `status`, and the error payload under `error`. Status `0` indicates a local or transport failure rather than an HTTP response.

Paged operations return only the requested page. Request subsequent pages explicitly; the server does not fetch or merge them automatically.

---

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `MEKARI_CLIENT_ID` | Required | Client ID used for HMAC signing |
| `MEKARI_CLIENT_SECRET` | Required | Client Secret used for HMAC signing |
| `MEKARI_BASE_URL` | `https://api.mekari.com` | API base URL; use only a trusted Mekari endpoint |
| `MEKARI_MODULES` | All modules | Comma-separated normalized module names, such as `accounts,customers` |
| `MEKARI_ENABLE_MUTATIONS` | `false` | Register mutation tools when exactly `true` |
| `MEKARI_ENABLE_DESTRUCTIVE` | `false` | Register destructive tools when exactly `true`; also requires mutations enabled |
| `MEKARI_DEBUG_LOG_BODIES` | `false` | Include request data in stderr logs when exactly `true` |

### Limit Available Tools

For a read-only server exposing accounts and customers:

```dotenv
MEKARI_MODULES=accounts,customers
MEKARI_ENABLE_MUTATIONS=false
MEKARI_ENABLE_DESTRUCTIVE=false
```

Module names must match the generated catalog. Disabled tools are omitted from the MCP registry, not merely blocked when called.

### Enable Write Operations

```dotenv
MEKARI_ENABLE_MUTATIONS=true
MEKARI_ENABLE_DESTRUCTIVE=false
```

To also register destructive operations, set both flags to `true`.

**Warning:** Destructive tools can delete or otherwise destructively change Mekari Jurnal data. The server does not provide undo or an additional approval prompt.

Restart your MCP server after changing configuration.

### Logging and File Access

- Request logs go to stderr and include method, path, status, and duration. Stdout is reserved for the MCP protocol.
- Authorization headers, client secrets, and request bodies are omitted from normal request logs.
- Debug body logging can expose financial or personal data. Keep it disabled unless needed for controlled local diagnostics.
- Upload tools read `file_path` on the server's machine and send `multipart/form-data`. Use absolute paths to avoid working-directory ambiguity.
- Upload paths are not restricted to a configured directory. Run the server with appropriate filesystem permissions and enable uploads only for trusted clients.

---

## Known Limitations

- **Mekari Jurnal only:** Other Mekari products are not supported.
- **Local stdio only:** No HTTP transport, hosted endpoint, or remote OAuth flow is implemented.
- **Specification-based coverage:** Tools reflect the bundled Swagger file, not live API discovery. Schemas and examples inherit source-specification limitations.
- **No automatic pagination:** One page per paged tool call.
- **No business orchestration:** The server translates API operations rather than combining them into workflows.
- **Local-file uploads only:** No base64 upload input. The entire file is read into memory before upload.
- **No built-in retry or explicit request timeout:** API and network failures are not automatically retried.
- **No live API verification in default tests:** Mocked coverage does not guarantee that every endpoint is available to your account.

---

## Troubleshooting

### Server Cannot Find Credentials

Errors such as `MEKARI_CLIENT_ID is required` or `MEKARI_CLIENT_SECRET is required` mean the variables did not reach the process. Check your `.env` values and `--env-file` path, or your MCP client's `env` configuration.

To run manually from the repository root:

```bash
pnpm run build
node --env-file=.env dist/src/index.js
```

A running stdio server waits for MCP messages; no startup banner is expected.

### MCP Client Cannot Start the Server

- Confirm Node.js 22+ is installed and accessible to the client.
- Run `pnpm run build` and verify `dist/src/index.js` exists.
- Use absolute paths for the entry point and `.env` file.
- Check the client's MCP logs or server stderr.

### Expected Tools Are Missing

- Check `MEKARI_MODULES` against normalized names in the [tool catalog](docs/generated/mekari-tools.md).
- Mutation tools require `MEKARI_ENABLE_MUTATIONS=true`.
- Destructive tools require both safety flags set to `true`.
- Restart the MCP server after changing these settings.

### Mekari Returns an Authorization Error

Check your Client ID, Client Secret, account API access, and API base URL. Requests use a signed HTTP date, so also check your machine's clock. Inspect the returned `status` and `error` without sharing credentials or authorization headers.

### A Tool Returns Status `0`

Inspect `error.message`. Possible causes include network failures, an invalid base URL, or an unreadable upload file. For uploads, confirm the file exists on the server's machine and the server process can read it.

### Input Validation Fails

Use the tool's advertised schema. Keep request bodies under `data`; pass path/query fields at the top level. Some numeric-looking parameters, including sales invoice pagination, are strings in the Swagger specification.

---

## Development

```bash
pnpm run generate
pnpm run test
pnpm run typecheck
pnpm run build
```

### Project Layout

| Path | Purpose |
| --- | --- |
| `docs/mekari.swagger.json` | Source API specification |
| `scripts/generate.ts` | Generates tool metadata and reference documentation |
| `src/generator/` | Swagger translation and generation logic |
| `src/generated/` | Generated MCP Modules and tools; do not edit manually |
| `src/config.ts`, `src/auth.ts`, `src/client.ts` | Configuration, HMAC signing, and API requests |
| `src/server.ts`, `src/tools.ts` | Stdio server, tool registration, schemas, and safety gates |
| `docs/generated/mekari-tools.md` | Generated full tool catalog; do not edit manually |
| `tests/` | Unit and mocked integration tests |

### Testing

The default suite does not call live Mekari Jurnal APIs or require real credentials. It checks Swagger coverage, generated output reproducibility, input validation, safety gates, uploads, result wrappers, single-request pagination behavior, and protocol-clean stdio startup.

## Contributing

Read [CONTEXT.md](CONTEXT.md) for domain terminology and the [architecture decision](docs/adr/0001-typescript-generated-mcp-tools.md) for the generator-first design. Change the source specification or generator rather than generated files, regenerate outputs, and run the development checks before submitting changes.
