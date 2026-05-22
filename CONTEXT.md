# Mekari Jurnal MCP

Mekari Jurnal MCP exposes Mekari Jurnal API operations as MCP tools for AI clients.

## Language

**Mekari Jurnal**:
The only Mekari product supported by this project.
_Avoid_: Mekari, Mekari products

**API-to-MCP Translation**:
Direct exposure of Mekari Jurnal API operations as MCP tools without adding new business workflows.
_Avoid_: AI workflow automation, business orchestration

**MCP Module**:
A group of MCP tools generated from exactly one Mekari Jurnal Swagger tag.
_Avoid_: domain module, product module

**Normalized Module Name**:
A snake_case identifier derived from a Mekari Jurnal Swagger tag without merging it with similar tags.
_Avoid_: merged module, inferred domain grouping

**MCP Tool Name**:
A snake_case tool identifier prefixed by its MCP Module name and suffixed by the API operation name.
_Avoid_: raw operationId, endpoint-only name

**MCP Operation Name**:
A normalized operation suffix derived from the API operation semantics, using `list`, `get`, `create`, `update`, `delete`, or the custom path action.
_Avoid_: index, show, malformed Swagger operationId

**MCP Tool Input**:
The MCP tool argument object with path and query parameters at the top level and request bodies under `data`.
_Avoid_: raw HTTP request object, flattened body fields

**MCP Tool Result**:
A minimal result wrapper that keeps the raw Mekari Jurnal response under `data` on success and the raw error body under `error` on failure.
_Avoid_: normalized business object, transformed response

**Paged API Result**:
A single page of Mekari Jurnal API results returned by one MCP tool call.
_Avoid_: auto-paginated collection, merged pages

**File Upload Input**:
An MCP tool input that references a local file path for Mekari Jurnal multipart upload operations.
_Avoid_: base64 upload payload, inline binary data

**Mekari Credential**:
Client ID and Client Secret used by the MCP server to sign Mekari Jurnal API requests.
_Avoid_: tool argument credential, AI-visible secret

## Relationships

- **API-to-MCP Translation** wraps **Mekari Jurnal** API operations.
- An **MCP Module** contains all API operations under one Mekari Jurnal Swagger tag.
- A **Normalized Module Name** preserves the boundary of one Swagger tag.
- An **MCP Tool Name** belongs to exactly one **MCP Module**.
- An **MCP Tool Name** combines one **MCP Module** name with one **MCP Operation Name**.
- An **MCP Tool Input** maps directly to one Mekari Jurnal API request.
- An **MCP Tool Result** preserves the Mekari Jurnal API response shape.
- A **Paged API Result** is not automatically expanded into multiple API requests.
- A **File Upload Input** is read by the MCP server before calling Mekari Jurnal.
- A **Mekari Credential** is configured outside MCP Tool Inputs and never exposed to AI clients.

## Example dialogue

> **Dev:** "Should this server combine invoice creation and payment receipt into one AI workflow?"
> **Domain expert:** "No. This project translates Mekari Jurnal API operations into MCP tools; workflows stay outside this project."
> **Dev:** "Should sales invoices and receive payments live in one accounting module?"
> **Domain expert:** "No. MCP Modules follow Swagger tags exactly, so `SALES INVOICES` and `RECEIVE PAYMENTS` stay separate."
> **Dev:** "Should `[SCM] PRODUCT UNIT` and `PRODUCT UNIT` be merged?"
> **Domain expert:** "No. Normalized Module Names only clean tag syntax; similar Swagger tags stay separate."
> **Dev:** "Can we expose the Swagger operationId `index` as an MCP tool?"
> **Domain expert:** "No. MCP Tool Names include the module prefix, such as `accounts_list`, so duplicate operation names stay unambiguous."
> **Dev:** "Should `show` become `accounts_show`?"
> **Domain expert:** "No. Generic Swagger operations use MCP Operation Names, so `show` becomes `get` and `index` becomes `list`."
> **Dev:** "Should body fields be mixed with query fields?"
> **Domain expert:** "No. MCP Tool Input keeps path and query parameters top-level, while request bodies go under `data`."
> **Dev:** "Should the MCP server rename response fields into cleaner domain objects?"
> **Domain expert:** "No. MCP Tool Results preserve raw Mekari Jurnal response data and only add the minimal success or error wrapper."
> **Dev:** "Should `sales_invoices_list` fetch every page?"
> **Domain expert:** "No. Paged API Results return only the requested Mekari Jurnal page; callers request the next page explicitly."
> **Dev:** "Should image upload tools accept base64?"
> **Domain expert:** "No. File Upload Inputs use local file paths so tool calls stay small."
> **Dev:** "Should each MCP call include `client_id` and `client_secret`?"
> **Domain expert:** "No. Mekari Credentials come from server environment variables and the server signs each API request."

## Flagged ambiguities

- "Mekari MCP" was narrowed to **Mekari Jurnal MCP**; other Mekari products are out of scope.
- "module" was resolved as **MCP Module**: one Swagger tag maps to one module.
- "normalized module" was resolved as **Normalized Module Name**: syntax cleanup only, no tag merging.
- "tool name" was resolved as **MCP Tool Name**: module-prefixed snake_case.
- "operation" was resolved as **MCP Operation Name**: normalized from API semantics, not copied blindly from Swagger `operationId`.
- "input" was resolved as **MCP Tool Input**: path and query parameters top-level, body under `data`.
- "response" was resolved as **MCP Tool Result**: raw Mekari Jurnal data wrapped with `ok`, plus `status` and `error` on failure.
- "pagination" was resolved as **Paged API Result**: no automatic pagination.
- "file upload" was resolved as **File Upload Input**: local `file_path`, no base64 payload.
- "credential" was resolved as **Mekari Credential**: env-only server config, never MCP tool input.
