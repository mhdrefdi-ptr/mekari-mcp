# Mekari Jurnal ledger and list parameters

## Sources and scope

Checked live public documentation; no authenticated transaction requests were made.

- [Mekari Developers: Product APIs](https://developers.mekari.com/docs/kb/product-api) links Jurnal documentation to `https://api-doc.jurnal.id/`.
- That [Swagger UI](https://api-doc.jurnal.id/) loads [the public Swagger JSON](https://api-doc.jurnal.id/swagger.json), fetched successfully for this check. Findings below identify paths within this document.
- The upstream [Jurnal Swagger JSON](https://my.jurnal.id/api/v1/swagger.json) was also fetched and agrees on the endpoints below, using `/api/v1/` rather than the gateway prefix `/public/jurnal/api/v1/`.
- [Requests and Responses](https://jurnal-mekari.stoplight.io/docs/jurnal-api/1e2140d7f0eb4-requests-and-responses) documents pagination for index actions, a maximum of 100 rows per response, and `next_link`/`prev_link` examples using `page`.

## 1. General ledger

Source: Swagger `GET /public/jurnal/api/v1/general_ledger`.

- Parameter names still include `tag_ids [unpublish]` and `tag_logic [unpublish]` in current public Swagger. This is not merely a stale local generated file.
- The same operation explicitly states: "`tag_ids` and `tag_logic` temporarily can not be used". Renaming the MCP inputs must not imply the upstream tag filters work. Omitting those unavailable inputs is another option.
- `account_id` is documented, including comma-separated multiple IDs.
- `start_date` and `end_date` use `dd/mm/yyyy`; `compare_type` accepts `custom` and named relative periods.
- Documentation supports requesting ledger data for selected accounts and custom dates. It does not prove every possible date range succeeds or prove that changing input names alone fixes loading in every MCP client.

## 2. Transaction lists

Sources: the corresponding GET operations in current public Swagger, plus Requests and Responses above.

- `bank_withdrawals`, `journal_entries`, and `bank_transfers` have no query parameters or filtering description in their GET operation definitions. Their empty generated parameter lists mirror upstream Swagger omissions.
- General index pagination documentation supports exposing `page`; endpoint-specific behavior was not tested here.
- No evidence from these sources establishes `per_page`, `start_date`, or `end_date` support for `bank_withdrawals` or `journal_entries`. Undocumented does not mean unsupported. Confirm behavior with controlled read-only API requests or Mekari support before promising these filters.
- `sales_invoices` explicitly declares `page`, `page_size`, `sort_key`, and `sort_order`. Its size parameter is `page_size`, not `per_page`.
- `purchase_invoices` has an empty parameter array, but its description documents `page`, `page_size`, `sort_key`, and `sort_order`. The description allows `start_date`/`end_date` with `sort_key=transaction_no` or `sort_key=created_at`, using `dd/mm/yyyy`; it warns transactions created before 5 November 2019 may need support-assisted reindexing. This endpoint is concrete evidence that parameter arrays are incomplete, not evidence that every list supports identical filters.

## Recommended scope

1. Repair or omit both unpublished ledger inputs; retain already-supported account/date inputs. Do not advertise tag-filter support.
2. Add pagination using upstream names and endpoint-specific evidence. Do not blanket-add `per_page` or date filters. For the two requested transaction endpoints, validate behavior before adding undocumented filters.

No application code changed. These findings concern documentation, not authenticated runtime verification.
