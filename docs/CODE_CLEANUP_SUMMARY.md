# Code Cleanup Summary

Date: 2026-05-20

## Removed

- Historical `doGet` actions for April/May 2026 repairs, setup, migration, and one-off records.
- Global Apps Script wrappers for historical repair/setup functions.
- Internal helper/default blocks used only by those actions.
- Runtime tests that only validated removed historical actions.
- `scripts/clasp-run.js` usage text for removed remote actions.

## Kept

- Live Telegram command/runtime path: `doPost`, authorization, parser, normalization, validation, idempotency, and sheet writes.
- Live read/closing `doGet` actions: `snapshot`, `summary`, `closing_draft`, `closing_close`, `selftest`.
- Reviewed POST historical import: `historical_import_reviewed`.
- Domain tests for active parser, planner, writer, summary, invoices, balances, closing, privacy, and guardrails.
- `migrateV55Parcelas()` global wrapper for the existing manual schema migration; review separately before removing.

## Reorganized

- `apps-script/Code.js` now marks local helper groups as `INFRA`, `PARSER`, `DOMAIN`, `READ_ONLY`, and `MUTATION`.
- Spreadsheet-writing helpers have explicit `MUTATION` comments: reviewed historical apply mode, closing draft/close, Telegram financial records, invoice reconciliation/status updates, balance snapshots, asset balance upserts, low-level row writes, and `migrateV55Parcelas()` as `REVIEW_LATER`.
- Read-only reporting helpers are grouped separately from write paths: `/resumo`, agenda, monthly review, safe finance questions, summary aggregation/formatting, snapshot export, and sheet readers.

## Historical Actions Removed From Runtime

See `docs/archive/HISTORICAL_REPAIR_ACTIONS.md` for the archived list.

## Still Uncertain

- `migrateV55Parcelas()` may now be historical, but it was not in the requested removal list and still represents a schema migration wrapper. REVIEW_LATER.
- `apps-script/Code.js` remains large, but helper sections now distinguish read-only/reporting paths from spreadsheet mutation paths without changing runtime behavior.

## Globals Still Needed

- `doGet(e)`
- `doPost(e)`
- `runHelpSmokeSelfTest()`
- `runTelegramWebhookSetupApply()`
- `runTelegramWebhookSetupDryRun()`
- `runWebhookSecretNegativeSelfTest()`
- `exportSnapshotV55()`
- `exportPilotFamilySummaryV55()`
- `writeDraftFamilyClosingV55()`
- `migrateV55Parcelas()`

## Next Refactor Block

- Compare and align card-cycle logic between `src/card-cycle.js` and Apps Script helpers.
- Decide whether `migrateV55Parcelas()` can be archived after schema evidence.
- Reduce text-coupled assertions in `test/apps-script-runtime.test.js` while preserving financial behavior coverage.
